import { describe, expect, it } from "vitest";
import { ProfileReviewRequestSchema } from "@rizz/shared";
import { normalizeProfile } from "../src/ai/profileShared.js";
import { buildProfilePrompt, PROFILE_SYSTEM } from "../src/ai/prompts.js";
import { MemoryEntitlements } from "../src/plans/quota.js";
import { MAX_REWARDED_INVITES, MemoryReferrals, referralCode } from "../src/plans/referrals.js";

describe("referral codes", () => {
  it("are stable, 6 chars, unambiguous, and secret-dependent", () => {
    const a = referralCode("device_aaaaaaaaaaaaaaaa", "s1".repeat(16));
    expect(a).toBe(referralCode("device_aaaaaaaaaaaaaaaa", "s1".repeat(16)));
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(a).not.toBe(referralCode("device_aaaaaaaaaaaaaaaa", "s2".repeat(16)));
  });

  it("count invites per referrer and allow one redemption per device", async () => {
    const r = new MemoryReferrals();
    await r.register("ABC234", "owner");
    expect(await r.redeem("f1", "ABC234")).toBe(true);
    expect(await r.redeem("f1", "ABC234")).toBe(false);
    expect(await r.invites("owner")).toBe(1);
    expect(MAX_REWARDED_INVITES).toBeGreaterThan(0);
  });
});

describe("Pro grants", () => {
  it("stack and expire", async () => {
    const e = new MemoryEntitlements();
    const t0 = new Date("2026-09-26T00:00:00Z");
    await e.grantProDays("d", 7, t0);
    const until = await e.grantProDays("d", 7, t0);
    expect(until.toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(await e.getPlan("d", new Date("2026-10-09T00:00:00Z"))).toBe("pro");
    expect(await e.getPlan("d", new Date("2026-10-11T00:00:00Z"))).toBe("free");
  });
});

describe("profile review", () => {
  const req = ProfileReviewRequestSchema.parse({
    bio: "call me 9876543210, i like tacos",
    images: [{ mediaType: "image/png", data: "A".repeat(200) }],
    roast: false,
  });

  it("prompt redacts the bio and states photo count / roast flag", () => {
    const p = buildProfilePrompt(req);
    expect(p).toContain("Photos attached: 1");
    expect(p).toContain("Roast requested: no");
    expect(p).toContain("[phone]");
    expect(PROFILE_SYSTEM).toContain("possible_minor");
  });

  it("normalises scores, drops out-of-range photos and unrequested roasts", () => {
    const out = normalizeProfile(
      {
        score: 11.37,
        firstImpression: "fun",
        photos: [
          { index: 1, score: 0.2, verdict: "v", tip: "t" },
          { index: 4, score: 8, verdict: "ghost photo", tip: "t" },
        ],
        bio: { score: 6.44, feedback: "f", rewrites: ["a", "b", "c", "d"] },
        strengths: ["s"],
        fixes: ["1", "2", "3", "4"],
        roast: "lol",
        safety: { flag: "none", message: "" },
      },
      req,
    );
    expect(out.score).toBe(10);
    expect(out.photos).toEqual([{ index: 1, score: 1, verdict: "v", tip: "t" }]);
    expect(out.bio?.score).toBe(6.4);
    expect(out.bio?.rewrites).toHaveLength(3);
    expect(out.fixes).toHaveLength(3);
    expect(out.roast).toBeNull();
  });

  it("empties everything for a possible minor", () => {
    const out = normalizeProfile(
      { score: 7, firstImpression: "x", photos: [], bio: null, strengths: ["a"], fixes: [], roast: null, safety: { flag: "possible_minor", message: "" } },
      req,
    );
    expect(out.strengths).toEqual([]);
    expect(out.safety.message).toMatch(/under 18/);
  });
});
