/**
 * Postgres-backed stores for quota, entitlements (Pro) and referrals — the
 * same interfaces as the in-memory versions, so the rest of the app doesn't
 * care which one it gets. Chats are never stored here.
 *
 * Works with any Postgres (Neon, Supabase, Render, RDS…). Tests run the same
 * SQL against PGlite (real Postgres in WASM).
 */
import type { QuotaInfo } from "@rizz/shared";
import { ABUSE_CAP, DAILY_LIMITS, type EntitlementStore, type Plan, type QuotaStore } from "./quota.js";
import type { ReferralStore } from "./referrals.js";

/** Minimal query interface satisfied by pg.Pool and PGlite. */
export interface Db {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usage (
  bucket     text    NOT NULL,
  device_id  text    NOT NULL,
  day        date    NOT NULL,
  used       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, device_id, day)
);
CREATE TABLE IF NOT EXISTS entitlements (
  device_id  text PRIMARY KEY,
  subscribed boolean NOT NULL DEFAULT false,
  pro_until  timestamptz
);
CREATE TABLE IF NOT EXISTS referral_codes (
  code       text PRIMARY KEY,
  device_id  text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS referral_redemptions (
  device_id  text PRIMARY KEY,
  code       text NOT NULL REFERENCES referral_codes(code),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_redemptions_code ON referral_redemptions(code);
`;

/** Create tables if missing (idempotent) and drop usage rows older than a week. */
export async function migrate(db: Db): Promise<void> {
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await db.query(stmt);
  await db.query(`DELETE FROM usage WHERE day < CURRENT_DATE - 7`);
}

const utcDay = (now: Date) => now.toISOString().slice(0, 10);
const nextUtcMidnight = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();

export class PgQuota implements QuotaStore {
  constructor(
    private db: Db,
    /** Separate counters per feature: "reply", "extract", "chat". */
    private bucket: string,
    private limits: Record<Plan, number | null> = DAILY_LIMITS,
  ) {}

  private info(plan: Plan, used: number, now: Date): QuotaInfo {
    return { plan, used, limit: this.limits[plan], resetsAt: nextUtcMidnight(now) };
  }

  async consume(deviceId: string, plan: Plan, now = new Date()) {
    const limit = Math.min(this.limits[plan] ?? ABUSE_CAP, ABUSE_CAP);
    // Atomic: increments only while under the limit, so concurrent requests can't overshoot.
    const { rows } = await this.db.query<{ used: number }>(
      `INSERT INTO usage (bucket, device_id, day, used) VALUES ($1, $2, $3::date, 1)
       ON CONFLICT (bucket, device_id, day) DO UPDATE SET used = usage.used + 1
       WHERE usage.used < $4
       RETURNING used`,
      [this.bucket, deviceId, utcDay(now), limit],
    );
    if (rows[0]) return { allowed: true, info: this.info(plan, Number(rows[0].used), now) };
    return { allowed: false, info: await this.peek(deviceId, plan, now) };
  }

  async refund(deviceId: string, now = new Date()) {
    await this.db.query(`UPDATE usage SET used = used - 1 WHERE bucket = $1 AND device_id = $2 AND day = $3::date AND used > 0`, [
      this.bucket,
      deviceId,
      utcDay(now),
    ]);
  }

  async peek(deviceId: string, plan: Plan, now = new Date()) {
    const { rows } = await this.db.query<{ used: number }>(`SELECT used FROM usage WHERE bucket = $1 AND device_id = $2 AND day = $3::date`, [
      this.bucket,
      deviceId,
      utcDay(now),
    ]);
    return this.info(plan, Number(rows[0]?.used ?? 0), now);
  }
}

export class PgEntitlements implements EntitlementStore {
  constructor(private db: Db) {}

  async getPlan(deviceId: string, now = new Date()): Promise<Plan> {
    const { rows } = await this.db.query<{ pro: boolean }>(
      `SELECT (subscribed OR COALESCE(pro_until > $2::timestamptz, false)) AS pro FROM entitlements WHERE device_id = $1`,
      [deviceId, now.toISOString()],
    );
    return rows[0]?.pro ? "pro" : "free";
  }

  async setPlan(deviceId: string, plan: Plan): Promise<void> {
    await this.db.query(
      `INSERT INTO entitlements (device_id, subscribed) VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE SET subscribed = EXCLUDED.subscribed`,
      [deviceId, plan === "pro"],
    );
  }

  async grantProDays(deviceId: string, days: number, now = new Date()): Promise<Date> {
    // Extends from the later of now / the current grant, so grants stack.
    const { rows } = await this.db.query<{ pro_until: Date | string }>(
      `INSERT INTO entitlements (device_id, pro_until) VALUES ($1, $2::timestamptz + make_interval(days => $3))
       ON CONFLICT (device_id) DO UPDATE
         SET pro_until = GREATEST(COALESCE(entitlements.pro_until, $2::timestamptz), $2::timestamptz) + make_interval(days => $3)
       RETURNING pro_until`,
      [deviceId, now.toISOString(), days],
    );
    return new Date(rows[0]!.pro_until);
  }

  async proUntil(deviceId: string): Promise<Date | null> {
    const { rows } = await this.db.query<{ pro_until: Date | string | null }>(`SELECT pro_until FROM entitlements WHERE device_id = $1`, [deviceId]);
    return rows[0]?.pro_until ? new Date(rows[0].pro_until) : null;
  }
}

export class PgReferrals implements ReferralStore {
  constructor(private db: Db) {}

  async register(code: string, deviceId: string) {
    await this.db.query(`INSERT INTO referral_codes (code, device_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [code, deviceId]);
  }

  async owner(code: string) {
    const { rows } = await this.db.query<{ device_id: string }>(`SELECT device_id FROM referral_codes WHERE code = $1`, [code]);
    return rows[0]?.device_id ?? null;
  }

  async redeem(deviceId: string, code: string) {
    // PRIMARY KEY on device_id makes "one code per device" atomic.
    const { rows } = await this.db.query(`INSERT INTO referral_redemptions (device_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING device_id`, [
      deviceId,
      code,
    ]);
    return rows.length > 0;
  }

  async hasRedeemed(deviceId: string) {
    const { rows } = await this.db.query(`SELECT 1 FROM referral_redemptions WHERE device_id = $1`, [deviceId]);
    return rows.length > 0;
  }

  async invites(referrerId: string) {
    const { rows } = await this.db.query<{ n: number | string }>(
      `SELECT count(*) AS n FROM referral_redemptions r JOIN referral_codes c ON c.code = r.code WHERE c.device_id = $1`,
      [referrerId],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
