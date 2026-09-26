/**
 * One behaviour suite, run against both the in-memory stores and the Postgres
 * stores (on PGlite — real Postgres in WASM), so they can never drift apart.
 */
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate, PgEntitlements, PgQuota, PgReferrals, type Db } from "../src/plans/postgres.js";
import { EXTRACT_LIMITS, MemoryEntitlements, MemoryQuota, type EntitlementStore, type QuotaStore } from "../src/plans/quota.js";
import { MemoryReferrals, type ReferralStore } from "../src/plans/referrals.js";

interface Stores {
  quota: QuotaStore;
  extract: QuotaStore;
  entitlements: EntitlementStore;
  referrals: ReferralStore;
}

const impls: [string, () => Promise<Stores>][] = [
  ["memory", async () => ({ quota: new MemoryQuota(), extract: new MemoryQuota(EXTRACT_LIMITS), entitlements: new MemoryEntitlements(), referrals: new MemoryReferrals() })],
  [
    "postgres",
    async () => {
      const db = new PGlite() as unknown as Db;
      await migrate(db);
      await migrate(db); // idempotent
      return { quota: new PgQuota(db, "reply"), extract: new PgQuota(db, "extract", EXTRACT_LIMITS), entitlements: new PgEntitlements(db), referrals: new PgReferrals(db) };
    },
  ],
];

const day = new Date("2026-09-26T10:00:00Z");
const D = "device_aaaaaaaaaaaaaaaa";

describe.each(impls)("%s stores", (_name, make) => {
  let s: Stores;
  beforeEach(async () => {
    s = await make();
  });

  it("enforces the daily free limit, resets next UTC day, keeps buckets separate", async () => {
    for (let i = 0; i < 10; i++) expect((await s.quota.consume(D, "free", day)).allowed).toBe(true);
    const denied = await s.quota.consume(D, "free", day);
    expect(denied.allowed).toBe(false);
    expect(denied.info).toMatchObject({ used: 10, limit: 10, resetsAt: "2026-09-27T00:00:00.000Z" });
    expect((await s.extract.consume(D, "free", day)).allowed).toBe(true); // other bucket unaffected
    expect((await s.quota.consume(D, "free", new Date("2026-09-27T00:00:01Z"))).allowed).toBe(true);
  });

  it("never overshoots under concurrent requests", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => s.quota.consume(D, "free", day)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect((await s.quota.peek(D, "free", day)).used).toBe(10);
  });

  it("refunds without going negative", async () => {
    await s.quota.consume(D, "free", day);
    await s.quota.refund(D, day);
    await s.quota.refund(D, day);
    expect((await s.quota.peek(D, "free", day)).used).toBe(0);
  });

  it("subscription and stacked Pro grants", async () => {
    expect(await s.entitlements.getPlan(D, day)).toBe("free");
    expect(await s.entitlements.proUntil(D)).toBeNull();
    await s.entitlements.grantProDays(D, 7, day);
    const until = await s.entitlements.grantProDays(D, 7, day);
    expect(until.toISOString()).toBe("2026-10-10T10:00:00.000Z");
    expect(await s.entitlements.getPlan(D, new Date("2026-10-09T00:00:00Z"))).toBe("pro");
    expect(await s.entitlements.getPlan(D, new Date("2026-10-11T00:00:00Z"))).toBe("free");

    await s.entitlements.setPlan("sub_device_aaaaaaaaaaaa", "pro");
    expect(await s.entitlements.getPlan("sub_device_aaaaaaaaaaaa", day)).toBe("pro");
    await s.entitlements.setPlan("sub_device_aaaaaaaaaaaa", "free");
    expect(await s.entitlements.getPlan("sub_device_aaaaaaaaaaaa", day)).toBe("free");
  });

  it("an expired subscription still honours a referral grant", async () => {
    await s.entitlements.grantProDays(D, 7, day);
    await s.entitlements.setPlan(D, "free"); // e.g. EXPIRATION webhook
    expect(await s.entitlements.getPlan(D, day)).toBe("pro");
  });

  it("referrals: register once, one redemption per device, invite counts", async () => {
    await s.referrals.register("ABC234", "owner_device_aaaaaaaa");
    await s.referrals.register("ABC234", "someone_else_aaaaaaaa"); // first owner wins
    expect(await s.referrals.owner("ABC234")).toBe("owner_device_aaaaaaaa");
    expect(await s.referrals.owner("ZZZZZZ")).toBeNull();
    expect(await s.referrals.redeem("friend_1_aaaaaaaaaaaa", "ABC234")).toBe(true);
    expect(await s.referrals.redeem("friend_1_aaaaaaaaaaaa", "ABC234")).toBe(false);
    expect(await s.referrals.redeem("friend_2_aaaaaaaaaaaa", "ABC234")).toBe(true);
    expect(await s.referrals.hasRedeemed("friend_1_aaaaaaaaaaaa")).toBe(true);
    expect(await s.referrals.hasRedeemed("owner_device_aaaaaaaa")).toBe(false);
    expect(await s.referrals.invites("owner_device_aaaaaaaa")).toBe(2);
  });
});

describe("postgres persistence", () => {
  it("survives a 'restart' (new store objects, same database)", async () => {
    const db = new PGlite() as unknown as Db;
    await migrate(db);
    await new PgQuota(db, "reply").consume(D, "free", day);
    await new PgEntitlements(db).grantProDays(D, 7, day);
    // "restart": brand new instances
    expect((await new PgQuota(db, "reply").peek(D, "free", day)).used).toBe(1);
    expect(await new PgEntitlements(db).getPlan(D, day)).toBe("pro");
  });
});
