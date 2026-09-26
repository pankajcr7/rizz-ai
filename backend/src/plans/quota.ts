/**
 * Plans and daily usage limits.
 * In-memory stores are fine for a single instance; swap for Redis/Postgres
 * (same interfaces) before running more than one server.
 */
import type { QuotaInfo } from "@rizz/shared";

export type Plan = "free" | "pro";

export const DAILY_LIMITS: Record<Plan, number | null> = {
  free: 10,
  pro: null, // unlimited (abuse cap below still applies)
};
/** Hard ceiling for any plan, so one leaked token can't burn the AI budget. */
export const ABUSE_CAP = 400;

/** Screenshot reads (vision) are metered separately so they don't eat reply quota. */
export const EXTRACT_LIMITS: Record<Plan, number | null> = { free: 25, pro: null };

/** Chat-mode messages are short and frequent, so they get their own, larger allowance. */
export const CHAT_LIMITS: Record<Plan, number | null> = { free: 30, pro: null };

export interface EntitlementStore {
  /** "pro" if subscribed OR inside a time-limited Pro grant (e.g. referral). */
  getPlan(deviceId: string, now?: Date): Promise<Plan>;
  /** Subscription state from the billing webhook. */
  setPlan(deviceId: string, plan: Plan): Promise<void>;
  /** Add Pro days on top of any existing grant. Returns the new end time. */
  grantProDays(deviceId: string, days: number, now?: Date): Promise<Date>;
  proUntil(deviceId: string): Promise<Date | null>;
}

export interface QuotaStore {
  /** Atomically consume one unit. Returns usage info and whether it was allowed. */
  consume(deviceId: string, plan: Plan, now?: Date): Promise<{ allowed: boolean; info: QuotaInfo }>;
  /** Give a unit back (used when the AI call fails, so users aren't charged for errors). */
  refund(deviceId: string, now?: Date): Promise<void>;
  peek(deviceId: string, plan: Plan, now?: Date): Promise<QuotaInfo>;
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10); // UTC day
}

function nextUtcMidnight(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d.toISOString();
}

export class MemoryEntitlements implements EntitlementStore {
  private plans = new Map<string, Plan>();
  private grants = new Map<string, number>(); // deviceId → epoch ms

  async getPlan(deviceId: string, now = new Date()): Promise<Plan> {
    if (this.plans.get(deviceId) === "pro") return "pro";
    return (this.grants.get(deviceId) ?? 0) > now.getTime() ? "pro" : "free";
  }
  async setPlan(deviceId: string, plan: Plan): Promise<void> {
    this.plans.set(deviceId, plan);
  }
  async grantProDays(deviceId: string, days: number, now = new Date()): Promise<Date> {
    const start = Math.max(now.getTime(), this.grants.get(deviceId) ?? 0);
    const until = start + days * 86_400_000;
    this.grants.set(deviceId, until);
    return new Date(until);
  }
  async proUntil(deviceId: string): Promise<Date | null> {
    const t = this.grants.get(deviceId);
    return t ? new Date(t) : null;
  }
}

export class MemoryQuota implements QuotaStore {
  private used = new Map<string, number>();

  constructor(private limits: Record<Plan, number | null> = DAILY_LIMITS) {}

  private key(deviceId: string, now: Date) {
    return `${dayKey(now)}:${deviceId}`;
  }

  private info(plan: Plan, used: number, now: Date): QuotaInfo {
    return { plan, used, limit: this.limits[plan], resetsAt: nextUtcMidnight(now) };
  }

  async consume(deviceId: string, plan: Plan, now = new Date()) {
    const key = this.key(deviceId, now);
    const used = this.used.get(key) ?? 0;
    const limit = Math.min(this.limits[plan] ?? ABUSE_CAP, ABUSE_CAP);
    if (used >= limit) return { allowed: false, info: this.info(plan, used, now) };
    this.used.set(key, used + 1);
    this.prune(now);
    return { allowed: true, info: this.info(plan, used + 1, now) };
  }

  async refund(deviceId: string, now = new Date()) {
    const key = this.key(deviceId, now);
    const used = this.used.get(key) ?? 0;
    if (used > 0) this.used.set(key, used - 1);
  }

  async peek(deviceId: string, plan: Plan, now = new Date()) {
    return this.info(plan, this.used.get(this.key(deviceId, now)) ?? 0, now);
  }

  /** Drop counters from previous days so memory doesn't grow forever. */
  private prune(now: Date) {
    const today = dayKey(now);
    if (this.used.size < 10_000) return;
    for (const k of this.used.keys()) if (!k.startsWith(today)) this.used.delete(k);
  }
}
