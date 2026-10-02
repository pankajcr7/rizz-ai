import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  ChatRequestSchema,
  DatePlanRequestSchema,
  TranscribeRequestSchema,
  ExtractRequestSchema,
  OpenersRequestSchema,
  ProfileReviewRequestSchema,
  RedeemRequestSchema,
  REFERRAL_REWARD_DAYS,
  SuggestRequestSchema,
  type ReferralInfo,
  type ApiError,
  type ApiErrorCode,
} from "@rizz/shared";
import { precheck, SAFETY_MESSAGES, mentionsMinor } from "../safety/guardrails.js";
import { isValidDeviceId, issueAccountToken, issueToken, verifySession } from "../plans/auth.js";
import { checkPassword, hashPassword, MemoryAccounts, type AccountStore } from "../plans/accounts.js";
import type { EntitlementStore, QuotaStore } from "../plans/quota.js";
import { MAX_REWARDED_INVITES, referralCode, type ReferralStore } from "../plans/referrals.js";
import type { RizzAI } from "../ai/types.js";
import type { Transcriber } from "../ai/transcribe.js";
import type { ResetMailer } from "../plans/resetMail.js";

export interface Deps {
  ai: RizzAI;
  quota: QuotaStore;
  /** Separate daily counter for screenshot reads. */
  extractQuota: QuotaStore;
  /** Separate daily counter for Chat mode messages. */
  chatQuota: QuotaStore;
  entitlements: EntitlementStore;
  referrals: ReferralStore;
  /** Speech-to-text for voice practice; optional (needs a Groq key). */
  transcriber?: Transcriber;
  tokenSecret: string;
  accounts?: AccountStore;
  resetMailer?: ResetMailer;
  webhookSecret?: string;
}

export function sendError(reply: FastifyReply, status: number, code: ApiErrorCode, message: string) {
  const body: ApiError = { error: { code, message } };
  return reply.code(status).send(body);
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function v1Routes(app: FastifyInstance, deps: Deps) {
  const { ai, quota, extractQuota, chatQuota, entitlements, referrals, tokenSecret } = deps;
  const accounts = deps.accounts ?? new MemoryAccounts();
  const credentials = z.object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(10).max(128) });

  async function referralInfo(deviceId: string): Promise<ReferralInfo> {
    const code = referralCode(deviceId, tokenSecret);
    await referrals.register(code, deviceId);
    const until = await entitlements.proUntil(deviceId);
    return {
      code,
      invites: await referrals.invites(deviceId),
      redeemed: await referrals.hasRedeemed(deviceId),
      proUntil: until && until.getTime() > Date.now() ? until.toISOString() : null,
    };
  }

  /** Resolve the device from the bearer token, or reply 401. */
  async function auth(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    const session = verifySession(token, tokenSecret);
    const account = session?.kind === "account" ? await accounts.byDevice(session.deviceId) : null;
    if (!session || (session.kind === "guest" && await accounts.isClaimed(session.deviceId)) ||
        (session.kind === "account" && (!account || (account.sessionVersion ?? 0) !== session.version))) {
      sendError(reply, 401, "unauthorized", "Missing or invalid session token");
      return null;
    }
    return session.deviceId;
  }

  /**
   * Charge one unit of quota, run the work, refund if the work throws.
   * Returns undefined if the quota was exhausted (reply already sent).
   */
  async function metered<T>(
    deviceId: string,
    reply: FastifyReply,
    work: () => Promise<T>,
    store: QuotaStore = quota,
  ): Promise<T | undefined> {
    const plan = await entitlements.getPlan(deviceId);
    const { allowed, info } = await store.consume(deviceId, plan);
    if (store === quota) {
      reply.header("x-quota-used", String(info.used));
      if (info.limit !== null) reply.header("x-quota-limit", String(info.limit));
    }
    if (!allowed) {
      const message =
        store === quota
          ? "You've used today's free replies. Upgrade to Pro for unlimited rizz."
          : store === chatQuota
            ? "You've used today's free chat messages. Upgrade to Pro for unlimited chat."
            : "You've read a lot of screenshots today. Paste the chat instead, or upgrade to Pro.";
      sendError(reply, 429, "quota_exceeded", message);
      return undefined;
    }
    try {
      return await work();
    } catch (err) {
      await store.refund(deviceId);
      throw err;
    }
  }

  // Tight per-IP limit: minting fresh device ids is the cheapest way to farm
  // free quota. Production should also verify Play Integrity / App Attest here.
  app.post("/v1/session", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req, reply) => {
    const deviceId = (req.body as { deviceId?: unknown } | undefined)?.deviceId;
    if (!isValidDeviceId(deviceId)) return sendError(reply, 400, "invalid_request", "deviceId must be 16-64 url-safe chars");
    if (await accounts.isClaimed(deviceId)) return sendError(reply, 401, "unauthorized", "Log in to use this account");
    return { token: issueToken(deviceId, tokenSecret) };
  });

  app.post("/v1/account/signup", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (req, reply) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    const session = verifySession(token, tokenSecret);
    if (!session || session.kind !== "guest" || await accounts.isClaimed(session.deviceId))
      return sendError(reply, 401, "unauthorized", "Start a guest session before creating an account");
    const { email, password } = credentials.parse(req.body);
    const passwordHash = await hashPassword(password);
    const sessionVersion = randomInt(1, 1_000_000_000);
    if (!(await accounts.register({ email, deviceId: session.deviceId, passwordHash, sessionVersion })))
      return sendError(reply, 409, "invalid_request", "This email or device already has an account");
    return { token: issueAccountToken(session.deviceId, tokenSecret, sessionVersion), deviceId: session.deviceId, email };
  });

  app.post("/v1/account/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const { email, password } = credentials.parse(req.body);
    const account = await accounts.byEmail(email);
    if (!(await checkPassword(password, account?.passwordHash ?? null)))
      return sendError(reply, 401, "unauthorized", "Email or password is incorrect");
    return { token: issueAccountToken(account!.deviceId, tokenSecret, account!.sessionVersion ?? 0), deviceId: account!.deviceId, email: account!.email };
  });

  const emailSchema = z.string().trim().toLowerCase().email().max(254);
  const resetHash = (email: string, code: string) => createHmac("sha256", tokenSecret).update(`${email}:${code}`).digest("hex");
  app.post("/v1/account/password-reset/request", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    if (!deps.resetMailer) return sendError(reply, 503, "not_supported", "Password recovery email is not available yet. Please try again later.");
    const code = String(randomInt(10_000_000, 100_000_000));
    const exists = await accounts.createReset(email, resetHash(email, code), new Date(Date.now() + 15 * 60_000));
    if (exists) {
      try { await deps.resetMailer(email, code); }
      catch { return sendError(reply, 503, "not_supported", "Couldn't send the recovery email. Please try again later."); }
    }
    return { ok: true, message: "If this email has an account, a reset code is on its way. Check your inbox and spam folder." };
  });
  app.post("/v1/account/password-reset/confirm", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req, reply) => {
    const { email, code, password } = z.object({ email: emailSchema, code: z.string().regex(/^\d{8}$/), password: z.string().min(10).max(128) }).parse(req.body);
    const changed = await accounts.resetPassword(email, resetHash(email, code), await hashPassword(password));
    if (!changed) return sendError(reply, 400, "invalid_request", "This code is invalid, expired, or already used. Request a new code.");
    return { ok: true };
  });
  app.delete("/v1/account", async (req, reply) => {
    const deviceId = await auth(req, reply);
    if (!deviceId) return reply;
    const current = await accounts.byDevice(deviceId);
    if (!current) return sendError(reply, 400, "invalid_request", "Guest users can delete local data in Profile.");
    const { password } = z.object({ password: z.string().min(1).max(128) }).parse(req.body);
    if (!(await checkPassword(password, current.passwordHash))) return sendError(reply, 403, "invalid_request", "Enter your current password to delete this account.");
    await accounts.delete(deviceId);
    await Promise.all([quota.forget?.(deviceId), extractQuota.forget?.(deviceId), chatQuota.forget?.(deviceId), entitlements.forget?.(deviceId), referrals.forget?.(deviceId)]);
    return { ok: true };
  });

  app.get("/v1/me", async (req, reply) => {
    const deviceId = await auth(req, reply);
    if (!deviceId) return reply;
    const plan = await entitlements.getPlan(deviceId);
    return { quota: await quota.peek(deviceId, plan), referral: await referralInfo(deviceId), features: { voice: !!deps.transcriber } };
  });

  app.post("/v1/suggest", async (req, reply) => {
    const deviceId = await auth(req, reply);
    if (!deviceId) return reply;
    const body = SuggestRequestSchema.parse(req.body);

    const extra = [body.notes, body.draft, body.prefs.aboutMe, ...(body.earlier ?? []).map((m) => m.text)].filter(
      (t): t is string => !!t,
    );
    const check = precheck(body.messages, extra);
    if (check.block) return sendError(reply, 403, "blocked_minor", SAFETY_MESSAGES.possible_minor);

    const result = await metered(deviceId, reply, () => ai.suggest(body, check.forcedFlag));
    if (!result) return reply;
    result.safety.message = SAFETY_MESSAGES[result.safety.flag];
    return result;
  });

  app.post("/v1/openers", async (req, reply) => {
    const deviceId = await auth(req, reply);
    if (!deviceId) return reply;
    const body = OpenersRequestSchema.parse(req.body);
    if (body.bio && mentionsMinor([body.bio])) return sendError(reply, 403, "blocked_minor", SAFETY_MESSAGES.possible_minor);

    const result = await metered(deviceId, reply, () =>
      ai.openers({ platform: body.platform, tone: body.tone, bio: body.bio, image: body.image, count: body.count, prefs: body.prefs }),
    );
    if (result) result.safety.message = SAFETY_MESSAGES[result.safety.flag];
    return result ?? reply;
  });

  // Screenshot → messages. Metered on its own daily counter (so reading a
  // screenshot doesn't cost a reply) with a tighter burst limit, because
  // vision requests are the most expensive.
  app.post("/v1/extract", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const deviceId = await auth(req, reply);
    if (!deviceId) return reply;
    const body = ExtractRequestSchema.parse(req.body);
    const result = await metered(deviceId, reply, () => ai.extract(body.image, body.platformHint), extractQuota);
    if (!result) return reply;
    if (mentionsMinor(result.messages.map((m) => m.text))) {
      return sendError(reply, 403, "blocked_minor", SAFETY_MESSAGES.possible_minor);
    }
    return result;
  });

  // Chat mode: wingman coach or practice-with-a-match.
  app.post("/v1/chat", async (req, reply) => {
    const deviceId = await auth(req, reply);
    if (!deviceId) return reply;
    const body = ChatRequestSchema.parse(req.body);
    // Only the user's own turns are checked; assistant turns are our output.
    const userTexts = body.turns.filter((t) => t.role === "user").map((t) => t.content);
    // A chat the user is asking the coach about gets the same checks as a reply request.
    const check = precheck(body.context?.messages ?? [], [...userTexts, body.prefs.aboutMe ?? ""]);
    if (check.block) return sendError(reply, 403, "blocked_minor", SAFETY_MESSAGES.possible_minor);
    const result = await metered(deviceId, reply, () => ai.chat(body, check.forcedFlag), chatQuota);
    if (result) result.safety.message = SAFETY_MESSAGES[result.safety.flag];
    return result ?? reply;
  });

  // Profile review: score the user's own photos + bio. One reply credit.
  app.post("/v1/profile-review", async (req, reply) => {
    const deviceId = await auth(req, reply);
    if (!deviceId) return reply;
    const body = ProfileReviewRequestSchema.parse(req.body);
    if (mentionsMinor([body.bio ?? "", body.prefs.aboutMe ?? ""])) {
      return sendError(reply, 403, "blocked_minor", SAFETY_MESSAGES.possible_minor);
    }
    const result = await metered(deviceId, reply, () => ai.profileReview(body));
    if (result) result.safety.message = SAFETY_MESSAGES[result.safety.flag];
    return result ?? reply;
  });

  // Date planner: 3 ideas + the message to ask them out. One reply credit.
  app.post("/v1/date-plan", async (req, reply) => {
    const deviceId = await auth(req, reply);
    if (!deviceId) return reply;
    const body = DatePlanRequestSchema.parse(req.body);
    const texts = [...body.messages.map((m) => m.text), ...(body.memory ?? []), body.prefs.aboutMe ?? ""];
    if (mentionsMinor(texts)) return sendError(reply, 403, "blocked_minor", SAFETY_MESSAGES.possible_minor);
    const result = await metered(deviceId, reply, () => ai.datePlan(body));
    if (result) result.safety.message = SAFETY_MESSAGES[result.safety.flag];
    return result ?? reply;
  });

  // Voice practice: speech → text. Uses the chat allowance.
  app.post("/v1/transcribe", { bodyLimit: 6 * 1024 * 1024 }, async (req, reply) => {
    const deviceId = await auth(req, reply);
    if (!deviceId) return reply;
    const transcriber = deps.transcriber;
    if (!transcriber) return sendError(reply, 501, "not_supported", "Voice isn't set up on this server (needs GROQ_API_KEY).");
    const body = TranscribeRequestSchema.parse(req.body);
    const audio = Buffer.from(body.data, "base64");
    const text = await metered(deviceId, reply, () => transcriber.transcribe(audio, body.mimeType, body.language), chatQuota);
    if (text === undefined) return reply;
    return { text };
  });

  // Referrals: redeem a friend's code → both get Pro days.
  app.post("/v1/referral/redeem", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (req, reply) => {
    const deviceId = await auth(req, reply);
    if (!deviceId) return reply;
    const { code } = RedeemRequestSchema.parse(req.body);
    const owner = await referrals.owner(code);
    if (!owner) return sendError(reply, 400, "invalid_request", "That code doesn't exist. Check it and try again.");
    if (owner === deviceId) return sendError(reply, 400, "invalid_request", "You can't use your own code — share it with a friend instead.");
    if (!(await referrals.redeem(deviceId, code))) return sendError(reply, 400, "invalid_request", "You've already used an invite code.");

    await entitlements.grantProDays(deviceId, REFERRAL_REWARD_DAYS);
    // Referrer is rewarded for their first N invites only (limits farming with throwaway devices).
    if ((await referrals.invites(owner)) <= MAX_REWARDED_INVITES) await entitlements.grantProDays(owner, REFERRAL_REWARD_DAYS);
    return { ok: true, rewardDays: REFERRAL_REWARD_DAYS, referral: await referralInfo(deviceId) };
  });

  // RevenueCat subscription webhook → entitlement updates.
  // The app sets RevenueCat's app_user_id to the device id.
  app.post("/v1/webhooks/revenuecat", async (req, reply) => {
    const secret = deps.webhookSecret;
    const given = req.headers.authorization ?? "";
    if (!secret || !safeEqual(given, `Bearer ${secret}`)) return sendError(reply, 401, "unauthorized", "Bad webhook secret");

    const event = (req.body as { event?: { type?: string; app_user_id?: string } } | undefined)?.event;
    const userId = event?.app_user_id;
    if (!event?.type || !isValidDeviceId(userId)) return sendError(reply, 400, "invalid_request", "Unrecognised event");

    const grants = ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "NON_RENEWING_PURCHASE"];
    if (grants.includes(event.type)) await entitlements.setPlan(userId, "pro");
    // CANCELLATION only turns off auto-renew; access continues until EXPIRATION.
    if (event.type === "EXPIRATION") await entitlements.setPlan(userId, "free");
    return { ok: true };
  });
}
