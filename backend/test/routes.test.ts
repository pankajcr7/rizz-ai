import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SuggestResponse } from "@rizz/shared";
import { buildApp } from "../src/app.js";
import { AiDeclinedError, AiUnavailableError, type RizzAI } from "../src/ai/types.js";
import { CHAT_LIMITS, EXTRACT_LIMITS, MemoryEntitlements, MemoryQuota } from "../src/plans/quota.js";
import { MemoryReferrals } from "../src/plans/referrals.js";

const SECRET = "s".repeat(32);
const WEBHOOK = "whsec_test";
const DEVICE = "dev_1234567890abcdef";

const okSuggest: SuggestResponse = {
  suggestions: [{ text: "ok but which pizza topping are you defending to the death", why: "Playful question" }],
  vibe: { interest: 72, mood: "friendly", summary: "Engaged", signals: ["asks questions back"] },
  safety: { flag: "none", message: "" },
  coachTip: "Match her energy.",
  memory: [],
};

function fakeAI(): RizzAI & { [K in keyof RizzAI]: ReturnType<typeof vi.fn> } {
  return {
    suggest: vi.fn(async () => structuredClone(okSuggest)),
    openers: vi.fn(async () => ({ openers: [{ text: "hi", why: "x" }], hooks: ["dog photo"], safety: { flag: "none" as const, message: "" } })),
    extract: vi.fn(async () => ({ platform: "instagram" as const, theirName: "Maya", messages: [{ from: "them" as const, text: "hey!" }] })),
    chat: vi.fn(async () => ({ reply: "ask her about the concert!", feedback: null, safety: { flag: "none" as const, message: "" } })),
    datePlan: vi.fn(async () => ({
      ideas: [{ title: "Pottery date", emoji: "🏺", why: "She loves pottery", where: "a pottery studio", cost: "₹800–1200", ask: "wanna get muddy together saturday? 🏺" }],
      tip: "Suggest Saturday afternoon",
      safety: { flag: "none" as const, message: "" },
    })),
    profileReview: vi.fn(async () => ({
      score: 7.2,
      firstImpression: "Friendly and outdoorsy",
      photos: [{ index: 1, score: 8, verdict: "Great smile", tip: "Crop closer" }],
      bio: null,
      strengths: ["warm smile"],
      fixes: ["add a hobby photo"],
      roast: null,
      safety: { flag: "none" as const, message: "" },
    })),
  };
}

const chat = { tone: "funny", messages: [{ from: "them", text: "pineapple on pizza is elite" }] };

describe("API", () => {
  let ai: ReturnType<typeof fakeAI>;
  let entitlements: MemoryEntitlements;
  let extractQuota: MemoryQuota;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: { authorization: string };

  beforeEach(async () => {
    ai = fakeAI();
    entitlements = new MemoryEntitlements();
    extractQuota = new MemoryQuota(EXTRACT_LIMITS);
    app = await buildApp({
      ai,
      quota: new MemoryQuota(),
      extractQuota,
      chatQuota: new MemoryQuota(CHAT_LIMITS),
      entitlements,
      referrals: new MemoryReferrals(),
      tokenSecret: SECRET,
      webhookSecret: WEBHOOK,
    });
    const res = await app.inject({ method: "POST", url: "/v1/session", payload: { deviceId: DEVICE } });
    auth = { authorization: `Bearer ${res.json().token}` };
  });

  it("allows CORS from the local web dev server only", async () => {
    const ok = await app.inject({ method: "OPTIONS", url: "/v1/suggest", headers: { origin: "http://localhost:8081", "access-control-request-method": "POST" } });
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:8081");
    const evil = await app.inject({ method: "OPTIONS", url: "/v1/suggest", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
    expect(evil.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("falls back to default CORS origins when the list is empty", async () => {
    const empty = await buildApp(
      { ai, quota: new MemoryQuota(), extractQuota, chatQuota: new MemoryQuota(CHAT_LIMITS), entitlements, referrals: new MemoryReferrals(), tokenSecret: SECRET },
      { corsOrigins: [] },
    );
    const res = await empty.inject({ method: "OPTIONS", url: "/v1/suggest", headers: { origin: "http://localhost:8081", "access-control-request-method": "POST" } });
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:8081");
  });

  it("answers the bare URL with a status message", async () => {
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: "Rizz AI API", status: "ok" });
  });

  it("rejects bad device ids", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/session", payload: { deviceId: "short" } });
    expect(res.statusCode).toBe(400);
  });

  it("requires a token", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/suggest", payload: chat });
    expect(res.statusCode).toBe(401);
    expect(ai.suggest).not.toHaveBeenCalled();
  });

  it("returns suggestions and applies defaults", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/suggest", headers: auth, payload: chat });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(okSuggest);
    expect(res.headers["x-quota-used"]).toBe("1");
    const [req, flag] = ai.suggest.mock.calls[0]!;
    expect(req).toMatchObject({ goal: "keep_going", count: 3, platform: "other", prefs: { length: "short", emoji: 1 } });
    expect(flag).toBe("none");
  });

  it("validates the body", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/suggest", headers: auth, payload: { ...chat, tone: "creepy" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_request");
  });

  it("blocks minors before calling the AI and without charging quota", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/suggest",
      headers: auth,
      payload: { ...chat, messages: [{ from: "them", text: "lol i'm 15" }] },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("blocked_minor");
    expect(ai.suggest).not.toHaveBeenCalled();
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: auth });
    expect(me.json().quota.used).toBe(0);
  });

  it("checks older live-read history for minors too", async () => {
    const payload = { ...chat, earlier: [{ from: "them", text: "btw i'm 16" }] };
    const res = await app.inject({ method: "POST", url: "/v1/suggest", headers: auth, payload });
    expect(res.statusCode).toBe(403);
    expect(ai.suggest).not.toHaveBeenCalled();
  });

  it("forces the not_interested flag and fills in a message", async () => {
    ai.suggest.mockImplementation(async (_req, flag) => ({ ...structuredClone(okSuggest), safety: { flag, message: "" } }));
    const res = await app.inject({
      method: "POST",
      url: "/v1/suggest",
      headers: auth,
      payload: { ...chat, messages: [{ from: "them", text: "please stop texting me" }] },
    });
    expect(ai.suggest.mock.calls[0]![1]).toBe("not_interested");
    expect(res.json().safety.flag).toBe("not_interested");
    expect(res.json().safety.message).toMatch(/graceful exit/);
  });

  it("enforces the free quota, then unlocks after a Pro purchase webhook", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await app.inject({ method: "POST", url: "/v1/suggest", headers: auth, payload: chat })).statusCode).toBe(200);
    }
    const denied = await app.inject({ method: "POST", url: "/v1/suggest", headers: auth, payload: chat });
    expect(denied.statusCode).toBe(429);
    expect(denied.json().error.code).toBe("quota_exceeded");

    const hook = await app.inject({
      method: "POST",
      url: "/v1/webhooks/revenuecat",
      headers: { authorization: `Bearer ${WEBHOOK}` },
      payload: { event: { type: "INITIAL_PURCHASE", app_user_id: DEVICE } },
    });
    expect(hook.statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/suggest", headers: auth, payload: chat })).statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: "/v1/webhooks/revenuecat",
      headers: { authorization: `Bearer ${WEBHOOK}` },
      payload: { event: { type: "EXPIRATION", app_user_id: DEVICE } },
    });
    expect(await entitlements.getPlan(DEVICE)).toBe("free");
  });

  it("rejects webhooks with the wrong secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/revenuecat",
      headers: { authorization: "Bearer nope" },
      payload: { event: { type: "INITIAL_PURCHASE", app_user_id: DEVICE } },
    });
    expect(res.statusCode).toBe(401);
    expect(await entitlements.getPlan(DEVICE)).toBe("free");
  });

  it("refunds quota and returns 503 when the AI is unavailable", async () => {
    ai.suggest.mockRejectedValueOnce(new AiUnavailableError("busy"));
    const res = await app.inject({ method: "POST", url: "/v1/suggest", headers: auth, payload: chat });
    expect(res.statusCode).toBe(503);
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: auth });
    expect(me.json().quota.used).toBe(0);
  });

  it("maps AI refusals to 422", async () => {
    ai.suggest.mockRejectedValueOnce(new AiDeclinedError());
    const res = await app.inject({ method: "POST", url: "/v1/suggest", headers: auth, payload: chat });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("ai_declined");
  });

  it("hides unexpected errors", async () => {
    ai.suggest.mockRejectedValueOnce(new Error("db password is hunter2"));
    const res = await app.inject({ method: "POST", url: "/v1/suggest", headers: auth, payload: chat });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("hunter2");
  });

  it("openers need a bio or image", async () => {
    const bad = await app.inject({ method: "POST", url: "/v1/openers", headers: auth, payload: { tone: "witty" } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/v1/openers", headers: auth, payload: { tone: "witty", bio: "dog mom, tacos" } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().hooks).toEqual(["dog photo"]);
  });

  it("rate-limits session creation per IP", async () => {
    // beforeEach already created one session
    const codes = [];
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "POST", url: "/v1/session", payload: { deviceId: `farm_device_${i}_abcdefgh` } });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 4)).toEqual([200, 200, 200, 200]);
    expect(codes[4]).toBe(429);
  });

  it("exempts localhost from rate limits only when asked (local dev)", async () => {
    const dev = await buildApp(
      { ai, quota: new MemoryQuota(), extractQuota, chatQuota: new MemoryQuota(CHAT_LIMITS), entitlements, referrals: new MemoryReferrals(), tokenSecret: SECRET },
      { exemptLoopback: true },
    );
    for (let i = 0; i < 8; i++) {
      const res = await dev.inject({ method: "POST", url: "/v1/session", payload: { deviceId: `dev_device_${i}_abcdefgh` } });
      expect(res.statusCode).toBe(200);
    }
  });

  it("caps free screenshot reads per day, separately from replies", async () => {
    for (let i = 0; i < EXTRACT_LIMITS.free!; i++) await extractQuota.consume(DEVICE, "free");
    const payload = { image: { mediaType: "image/png", data: "A".repeat(200) } };
    const res = await app.inject({ method: "POST", url: "/v1/extract", headers: auth, payload });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.message).toMatch(/screenshots/);
    expect(ai.extract).not.toHaveBeenCalled();
    // replies still work
    expect((await app.inject({ method: "POST", url: "/v1/suggest", headers: auth, payload: chat })).statusCode).toBe(200);
  });

  it("extract transcribes a screenshot without using reply quota", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/extract",
      headers: auth,
      payload: { image: { mediaType: "image/png", data: "A".repeat(200) } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().theirName).toBe("Maya");
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: auth });
    expect(me.json().quota.used).toBe(0);
  });

  describe("chat mode", () => {
    const coach = { mode: "coach", turns: [{ role: "user", content: "she left me on read for 2 days, what now?" }] };

    it("answers coach questions with defaults applied", async () => {
      const res = await app.inject({ method: "POST", url: "/v1/chat", headers: auth, payload: coach });
      expect(res.statusCode).toBe(200);
      expect(res.json().reply).toMatch(/concert/);
      const [req] = ai.chat.mock.calls[0]!;
      expect(req).toMatchObject({ mode: "coach", persona: "friendly", prefs: { language: "auto" } });
    });

    it("requires the last turn to be the user's", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/chat",
        headers: auth,
        payload: { turns: [{ role: "user", content: "hi" }, { role: "assistant", content: "hey!" }] },
      });
      expect(res.statusCode).toBe(400);
    });

    it("blocks minors mentioned by the user", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/chat",
        headers: auth,
        payload: { turns: [{ role: "user", content: "how do i text her, she's 15 years old" }] },
      });
      expect(res.statusCode).toBe(403);
      expect(ai.chat).not.toHaveBeenCalled();
    });

    it("coaches about a live-read chat and applies the same safety checks to it", async () => {
      const context = { theirName: "Maya", messages: [{ from: "them", text: "haha stop" }, { from: "me", text: "never" }] };
      const ok = await app.inject({ method: "POST", url: "/v1/chat", headers: auth, payload: { ...coach, context } });
      expect(ok.statusCode).toBe(200);
      expect(ai.chat.mock.calls[0]![0]).toMatchObject({ context: { platform: "other", theirName: "Maya" } });

      const no = { messages: [{ from: "them", text: "i'm not interested, please stop" }] };
      await app.inject({ method: "POST", url: "/v1/chat", headers: auth, payload: { ...coach, context: no } });
      expect(ai.chat.mock.calls[1]![1]).toBe("not_interested");

      const minor = { messages: [{ from: "them", text: "i'm 15 btw" }] };
      const blocked = await app.inject({ method: "POST", url: "/v1/chat", headers: auth, payload: { ...coach, context: minor } });
      expect(blocked.statusCode).toBe(403);
      expect(ai.chat).toHaveBeenCalledTimes(2);
    });

    it("uses its own daily allowance, not reply quota", async () => {
      for (let i = 0; i < CHAT_LIMITS.free!; i++) {
        expect((await app.inject({ method: "POST", url: "/v1/chat", headers: auth, payload: coach })).statusCode).toBe(200);
      }
      const denied = await app.inject({ method: "POST", url: "/v1/chat", headers: auth, payload: coach });
      expect(denied.statusCode).toBe(429);
      expect(denied.json().error.message).toMatch(/chat/);
      const me = await app.inject({ method: "GET", url: "/v1/me", headers: auth });
      expect(me.json().quota.used).toBe(0);
    });
  });

  describe("profile review", () => {
    it("reviews and charges one reply credit", async () => {
      const res = await app.inject({ method: "POST", url: "/v1/profile-review", headers: auth, payload: { bio: "dog dad, hikes, bad puns" } });
      expect(res.statusCode).toBe(200);
      expect(res.json().score).toBe(7.2);
      expect(ai.profileReview.mock.calls[0]![0]).toMatchObject({ platform: "tinder", roast: false, images: [] });
      const me = await app.inject({ method: "GET", url: "/v1/me", headers: auth });
      expect(me.json().quota.used).toBe(1);
    });

    it("needs a photo or a bio, max 3 photos", async () => {
      expect((await app.inject({ method: "POST", url: "/v1/profile-review", headers: auth, payload: {} })).statusCode).toBe(400);
      const img = { mediaType: "image/png", data: "A".repeat(200) };
      const four = await app.inject({ method: "POST", url: "/v1/profile-review", headers: auth, payload: { images: [img, img, img, img] } });
      expect(four.statusCode).toBe(400);
    });

    it("blocks minors", async () => {
      const res = await app.inject({ method: "POST", url: "/v1/profile-review", headers: auth, payload: { bio: "im 16 and love music" } });
      expect(res.statusCode).toBe(403);
      expect(ai.profileReview).not.toHaveBeenCalled();
    });
  });

  describe("referrals", () => {
    const session = async (deviceId: string) => {
      const r = await app.inject({ method: "POST", url: "/v1/session", payload: { deviceId } });
      return { authorization: `Bearer ${r.json().token}` };
    };

    it("gives both people Pro days, once", async () => {
      const me = (await app.inject({ method: "GET", url: "/v1/me", headers: auth })).json();
      expect(me.referral).toMatchObject({ invites: 0, redeemed: false, proUntil: null });
      expect(me.referral.code).toMatch(/^[A-Z2-9]{6}$/);

      const friend = await session("friend_device_abcdefgh");
      const res = await app.inject({ method: "POST", url: "/v1/referral/redeem", headers: friend, payload: { code: me.referral.code.toLowerCase() } });
      expect(res.statusCode).toBe(200);
      expect(res.json().referral.redeemed).toBe(true);
      expect(await entitlements.getPlan("friend_device_abcdefgh")).toBe("pro");
      expect(await entitlements.getPlan(DEVICE)).toBe("pro");

      const after = (await app.inject({ method: "GET", url: "/v1/me", headers: auth })).json();
      expect(after.referral.invites).toBe(1);
      expect(after.quota.plan).toBe("pro");

      const again = await app.inject({ method: "POST", url: "/v1/referral/redeem", headers: friend, payload: { code: me.referral.code } });
      expect(again.statusCode).toBe(400);
      expect(again.json().error.message).toMatch(/already/);
    });

    it("rejects own and unknown codes", async () => {
      const me = (await app.inject({ method: "GET", url: "/v1/me", headers: auth })).json();
      const own = await app.inject({ method: "POST", url: "/v1/referral/redeem", headers: auth, payload: { code: me.referral.code } });
      expect(own.json().error.message).toMatch(/own code/);
      const unknown = await app.inject({ method: "POST", url: "/v1/referral/redeem", headers: auth, payload: { code: "ZZZZZZ" } });
      expect(unknown.json().error.message).toMatch(/doesn't exist/);
      const bad = await app.inject({ method: "POST", url: "/v1/referral/redeem", headers: auth, payload: { code: "no" } });
      expect(bad.statusCode).toBe(400);
    });
  });

  describe("date planner", () => {
    it("plans a date and charges a reply credit", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/v1/date-plan",
        headers: auth,
        payload: { city: "Bengaluru", memory: ["loves pottery"], messages: [{ from: "them", text: "i'm free saturday" }] },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().ideas[0].title).toBe("Pottery date");
      expect(ai.datePlan.mock.calls[0]![0]).toMatchObject({ budget: "mid", vibe: "fun", city: "Bengaluru" });
      expect((await app.inject({ method: "GET", url: "/v1/me", headers: auth })).json().quota.used).toBe(1);
    });

    it("blocks minors", async () => {
      const res = await app.inject({ method: "POST", url: "/v1/date-plan", headers: auth, payload: { messages: [{ from: "them", text: "i'm 16 lol" }] } });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("voice transcription", () => {
    const audio = { mimeType: "audio/m4a", data: "A".repeat(400) };

    it("answers 501 when no transcriber is configured, and /me says voice is off", async () => {
      const res = await app.inject({ method: "POST", url: "/v1/transcribe", headers: auth, payload: audio });
      expect(res.statusCode).toBe(501);
      expect(res.json().error.code).toBe("not_supported");
      expect((await app.inject({ method: "GET", url: "/v1/me", headers: auth })).json().features.voice).toBe(false);
    });

    it("transcribes with the configured transcriber, using chat allowance", async () => {
      const transcribe = vi.fn(async () => "hey what's up");
      const voiceApp = await buildApp({
        ai,
        quota: new MemoryQuota(),
        extractQuota,
        chatQuota: new MemoryQuota(CHAT_LIMITS),
        entitlements,
        referrals: new MemoryReferrals(),
        transcriber: { transcribe },
        tokenSecret: SECRET,
      });
      const res = await voiceApp.inject({ method: "POST", url: "/v1/transcribe", headers: auth, payload: { ...audio, language: "english" } });
      expect(res.statusCode).toBe(200);
      expect(res.json().text).toBe("hey what's up");
      const [buf, mime, lang] = transcribe.mock.calls[0] as unknown as [Buffer, string, string];
      expect(buf.length).toBeGreaterThan(0);
      expect([mime, lang]).toEqual(["audio/m4a", "english"]);
      const me = (await voiceApp.inject({ method: "GET", url: "/v1/me", headers: auth })).json();
      expect(me.features.voice).toBe(true);
      expect(me.quota.used).toBe(0);
    });
  });
});
