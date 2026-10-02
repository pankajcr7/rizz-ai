import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Db } from "./postgres.js";

const scrypt = promisify(scryptCallback);

export interface Account {
  email: string;
  deviceId: string;
  passwordHash: string;
  sessionVersion?: number;
}

export interface AccountStore {
  register(account: Account): Promise<boolean>;
  byEmail(email: string): Promise<Account | null>;
  isClaimed(deviceId: string): Promise<boolean>;
  byDevice(deviceId: string): Promise<Account | null>;
  delete(deviceId: string): Promise<void>;
  createReset(email: string, tokenHash: string, expiresAt: Date): Promise<boolean>;
  resetPassword(email: string, tokenHash: string, passwordHash: string, now?: Date): Promise<boolean>;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("base64url")}`;
}

export async function checkPassword(password: string, stored: string | null): Promise<boolean> {
  const [, salt, key] = stored?.split(":") ?? [];
  // Do equal work for unknown emails; the response never says whether the email exists.
  const candidate = (await scrypt(password, salt || "no-such-account-salt", 64)) as Buffer;
  if (!salt || !key) return false;
  const actual = Buffer.from(key, "base64url");
  return actual.length === candidate.length && timingSafeEqual(actual, candidate);
}

export class MemoryAccounts implements AccountStore {
  private byMail = new Map<string, Account>();
  private devices = new Map<string, Account>();
  private resets = new Map<string, { tokenHash: string; expiresAt: number; attempts: number }>();

  async register(account: Account) {
    if (this.byMail.has(account.email) || this.devices.has(account.deviceId)) return false;
    this.byMail.set(account.email, account);
    this.devices.set(account.deviceId, account);
    return true;
  }
  async byEmail(email: string) { return this.byMail.get(email) ?? null; }
  async isClaimed(deviceId: string) { return this.devices.has(deviceId); }
  async byDevice(deviceId: string) { return this.devices.get(deviceId) ?? null; }
  async delete(deviceId: string) {
    const account = this.devices.get(deviceId);
    if (account) { this.byMail.delete(account.email); this.resets.delete(account.email); }
    this.devices.delete(deviceId);
  }
  async createReset(email: string, tokenHash: string, expiresAt: Date) {
    if (!this.byMail.has(email)) return false;
    this.resets.set(email, { tokenHash, expiresAt: expiresAt.getTime(), attempts: 0 });
    return true;
  }
  async resetPassword(email: string, tokenHash: string, passwordHash: string, now = new Date()) {
    const reset = this.resets.get(email);
    const account = this.byMail.get(email);
    if (!reset || !account || reset.expiresAt <= now.getTime() || reset.attempts >= 5) return false;
    reset.attempts++;
    if (!safeHashEqual(reset.tokenHash, tokenHash)) return false;
    account.passwordHash = passwordHash;
    account.sessionVersion = (account.sessionVersion ?? 0) + 1;
    this.resets.delete(email);
    return true;
  }
}

export class PgAccounts implements AccountStore {
  constructor(private db: Db) {}

  async register(account: Account) {
    const { rows } = await this.db.query(
      `INSERT INTO accounts (email, device_id, password_hash, session_version) VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING RETURNING device_id`,
      [account.email, account.deviceId, account.passwordHash, account.sessionVersion ?? 0],
    );
    return rows.length > 0;
  }

  async byEmail(email: string) {
    const { rows } = await this.db.query<{ email: string; device_id: string; password_hash: string; session_version: number }>(
      `SELECT email, device_id, password_hash, session_version FROM accounts WHERE email = $1`, [email],
    );
    const row = rows[0];
    return row ? { email: row.email, deviceId: row.device_id, passwordHash: row.password_hash, ...(row.session_version ? { sessionVersion: row.session_version } : {}) } : null;
  }

  async isClaimed(deviceId: string) {
    const { rows } = await this.db.query(`SELECT 1 FROM accounts WHERE device_id = $1`, [deviceId]);
    return rows.length > 0;
  }

  async byDevice(deviceId: string) {
    const { rows } = await this.db.query<{ email: string; device_id: string; password_hash: string; session_version: number }>(
      `SELECT email, device_id, password_hash, session_version FROM accounts WHERE device_id = $1`, [deviceId],
    );
    const row = rows[0];
    return row ? { email: row.email, deviceId: row.device_id, passwordHash: row.password_hash, ...(row.session_version ? { sessionVersion: row.session_version } : {}) } : null;
  }
  async createReset(email: string, tokenHash: string, expiresAt: Date) {
    const { rows } = await this.db.query(`
      INSERT INTO account_resets (email, token_hash, expires_at, attempts, consumed)
      SELECT email, $2, $3::timestamptz, 0, false FROM accounts WHERE email = $1
      ON CONFLICT (email) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, attempts = 0, consumed = false
      RETURNING email`, [email, tokenHash, expiresAt.toISOString()]);
    return rows.length > 0;
  }
  async resetPassword(email: string, tokenHash: string, passwordHash: string, now = new Date()) {
    const { rows } = await this.db.query(`
      WITH attempt AS (
        UPDATE account_resets SET attempts = attempts + 1, consumed = (token_hash = $2)
        WHERE email = $1 AND NOT consumed AND attempts < 5 AND expires_at > $4::timestamptz RETURNING token_hash
      ), changed AS (
        UPDATE accounts SET password_hash = $3, session_version = session_version + 1
        WHERE email = $1 AND EXISTS (SELECT 1 FROM attempt WHERE token_hash = $2) RETURNING email
      )
      SELECT email FROM changed`, [email, tokenHash, passwordHash, now.toISOString()]);
    return rows.length > 0;
  }
  async delete(deviceId: string) {
    // One statement keeps deletion atomic when using a pooled connection.
    await this.db.query(`
      WITH redemptions AS (
        DELETE FROM referral_redemptions WHERE device_id = $1 OR code IN
          (SELECT code FROM referral_codes WHERE device_id = $1) RETURNING device_id
      ), codes AS (
        DELETE FROM referral_codes WHERE device_id = $1 AND (SELECT count(*) FROM redemptions) >= 0
      ), usage_deleted AS (DELETE FROM usage WHERE device_id = $1),
      entitlements_deleted AS (DELETE FROM entitlements WHERE device_id = $1)
      DELETE FROM accounts WHERE device_id = $1`, [deviceId]);
  }
}

function safeHashEqual(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
