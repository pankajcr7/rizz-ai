/**
 * Claude-backed implementation of the RizzAI interface.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type {
  ChatRequestParsed,
  ChatResponse,
  DatePlanRequestParsed,
  DatePlanResponse,
  ExtractResponse,
  ProfileReviewRequestParsed,
  ProfileReviewResponse,
  ImageInput,
  OpenersResponse,
  Platform,
  Preferences,
  SafetyFlag,
  SuggestRequestParsed,
  SuggestResponse,
  ToneId,
} from "@rizz/shared";
import { buildDatePrompt, buildOpenersPrompt, buildProfilePrompt, buildSuggestPrompt, chatSystem, DATE_SYSTEM, EXTRACT_SYSTEM, OPENERS_SYSTEM, PROFILE_SYSTEM, SUGGEST_SYSTEM } from "./prompts.js";
import { coachIssue, normalizeChat, normalizeCoach, prepareTurns } from "./chatShared.js";
import { mergeFlag } from "./safetyFlags.js";
import { SAFETY_MESSAGES } from "../safety/guardrails.js";
import { groundFillInText, suggestionIssue } from "./suggestionQuality.js";
import { ChatOut, CoachOut, DateOut, ExtractOut, OpenersOut, ProfileOut, SuggestOut } from "./schemas.js";
import { normalizeDate } from "./dateShared.js";
import { normalizeProfile } from "./profileShared.js";
import { AiDeclinedError, AiUnavailableError, type RizzAI } from "./types.js";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeConfig {
  model: string;
  effort: Effort;
  client?: Anthropic;
}

export { mergeFlag };

export function createClaudeAI(cfg: ClaudeConfig): RizzAI {
  const client = cfg.client ?? new Anthropic();

  async function call<T extends z.ZodType>(
    schema: T,
    system: string,
    content: Anthropic.Beta.BetaContentBlockParam[] | Anthropic.Beta.BetaMessageParam[],
  ): Promise<z.infer<T>> {
    // A content-block array is a single user turn; a message array is a full conversation.
    const messages: Anthropic.Beta.BetaMessageParam[] =
      content.length > 0 && "role" in content[0]!
        ? (content as Anthropic.Beta.BetaMessageParam[])
        : [{ role: "user", content: content as Anthropic.Beta.BetaContentBlockParam[] }];
    let res;
    try {
      res = await client.beta.messages.parse({
        model: cfg.model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        // Stable system prompt first, marked for caching.
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages,
        output_config: { effort: cfg.effort, format: betaZodOutputFormat(schema) },
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new AiUnavailableError("AI is busy, try again in a moment", new Error("Anthropic HTTP 429"));
      if (err instanceof Anthropic.InternalServerError) throw new AiUnavailableError("AI is temporarily unavailable", new Error(`Anthropic HTTP ${err.status}`));
      if (err instanceof Anthropic.APIConnectionError) throw new AiUnavailableError("Could not reach the AI", new Error("Anthropic connection failed"));
      // Server misconfiguration (missing/invalid key). Users see "unavailable"; the log says why.
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        throw new AiUnavailableError("AI is temporarily unavailable", new Error(`Anthropic API key rejected (HTTP ${err.status})`));
      }
      if (err instanceof Anthropic.APIError) throw new Error(`Anthropic HTTP ${err.status}`);
      throw err; // 400/401/404 are our bugs — surface them as 500s
    }
    if (res.stop_reason === "refusal") throw new AiDeclinedError(res.stop_details?.explanation ?? undefined);
    if (res.stop_reason === "max_tokens" || !res.parsed_output) {
      throw new AiUnavailableError(`AI returned an unusable response (stop_reason=${res.stop_reason})`);
    }
    return res.parsed_output as z.infer<T>;
  }

  return {
    async suggest(req: SuggestRequestParsed, forcedFlag: SafetyFlag): Promise<SuggestResponse> {
      const text = buildSuggestPrompt(req, forcedFlag);
      let out = await call(SuggestOut, SUGGEST_SYSTEM, [{ type: "text", text }]);
      const issue = suggestionIssue(out.suggestions, req.count, out.safety.flag);
      if (issue) {
        out = await call(SuggestOut, SUGGEST_SYSTEM, [{ type: "text", text: `${text}\n\nCorrect the previous output: ${issue}` }]);
        if (suggestionIssue(out.suggestions, req.count, out.safety.flag)) throw new AiUnavailableError("Couldn't produce usable replies. Please try again.");
      }
      return normalizeSuggest(out, req.count, forcedFlag, req);
    },

    async openers(args: {
      platform: Platform;
      tone: ToneId;
      bio?: string;
      image?: ImageInput;
      count: number;
      prefs: Preferences;
    }): Promise<OpenersResponse> {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (args.image) {
        content.push({ type: "image", source: { type: "base64", media_type: args.image.mediaType, data: args.image.data } });
      }
      content.push({ type: "text", text: buildOpenersPrompt({ ...args, hasImage: !!args.image }) });
      const out = await call(OpenersOut, OPENERS_SYSTEM, content);
      const blocked = out.safety.flag === "possible_minor";
      return {
        openers: blocked ? [] : out.openers.slice(0, args.count),
        hooks: out.hooks.slice(0, 6),
        safety: out.safety,
      };
    },

    async chat(req: ChatRequestParsed, forcedFlag: SafetyFlag): Promise<ChatResponse> {
      const turns = prepareTurns(req).map((t) => ({ role: t.role, content: t.content }));
      if (req.mode === "coach") {
        let out = await call(CoachOut, chatSystem(req.mode), turns);
        const issue = coachIssue(out);
        if (issue) {
          out = await call(CoachOut, chatSystem(req.mode), [...turns, { role: "user", content: issue }]);
          if (coachIssue(out)) throw new AiUnavailableError("Couldn't produce useful coaching. Please try again.");
        }
        return normalizeCoach(out, req, forcedFlag);
      }
      const out = await call(ChatOut, chatSystem(req.mode), turns);
      return normalizeChat(out, req, forcedFlag);
    },

    async datePlan(req: DatePlanRequestParsed): Promise<DatePlanResponse> {
      const out = await call(DateOut, DATE_SYSTEM, [{ type: "text", text: buildDatePrompt(req) }]);
      return normalizeDate(out as DatePlanResponse);
    },

    async profileReview(req: ProfileReviewRequestParsed): Promise<ProfileReviewResponse> {
      const content: Anthropic.Beta.BetaContentBlockParam[] = req.images.flatMap((img, i) => [
        { type: "text" as const, text: `Photo ${i + 1}:` },
        { type: "image" as const, source: { type: "base64" as const, media_type: img.mediaType, data: img.data } },
      ]);
      content.push({ type: "text", text: buildProfilePrompt(req) });
      const out = await call(ProfileOut, PROFILE_SYSTEM, content);
      return normalizeProfile(out as ProfileReviewResponse, req);
    },

    async extract(image: ImageInput, platformHint?: Platform): Promise<ExtractResponse> {
      const hint = platformHint ? `This screenshot is probably from ${platformHint}.` : "Identify the app if you can.";
      return call(ExtractOut, EXTRACT_SYSTEM, [
        { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
        { type: "text", text: `${hint} Transcribe the conversation.` },
      ]);
    },
  };
}

/**
 * Some models answer 0.7 instead of 70 despite the schema. Only clear fractions
 * are rescaled — a real "8" (8% interested) must stay low, not become 80.
 */
export function toPercent(n: number): number {
  const scaled = n > 0 && n < 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(scaled)));
}

/** Keep memory facts short, unique and free of contact details. */
export function cleanMemory(facts: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of facts) {
    const f = raw.trim().replace(/\s+/g, " ").slice(0, 120);
    const key = f.toLowerCase();
    if (!f || seen.has(key) || /\d{6,}|@|https?:/i.test(f)) continue;
    seen.add(key);
    out.push(f);
    if (out.length === 5) break;
  }
  return out;
}

export function normalizeSuggest(out: z.infer<typeof SuggestOut>, count: number, forcedFlag: SafetyFlag, req?: SuggestRequestParsed): SuggestResponse {
  const flag = mergeFlag(forcedFlag, out.safety.flag);
  return {
    suggestions: flag === "possible_minor" ? [] : out.suggestions.filter((s) => s.text.trim()).slice(0, count).map((s) => ({ ...s, text: flag === "none" ? groundFillInText(s.text) : s.text })),
    vibe: {
      ...out.vibe,
      interest: toPercent(out.vibe.interest),
      signals: out.vibe.signals.slice(0, 5),
      ghost: out.vibe.ghost ? { ...out.vibe.ghost, risk: toPercent(out.vibe.ghost.risk) } : undefined,
    },
    safety: { flag, message: SAFETY_MESSAGES[flag] },
    coachTip: out.coachTip,
    memory: flag === "possible_minor" ? [] : cleanMemory(out.memory ?? []),
    nextMove: flag !== "none" ? { action: "end", reason: SAFETY_MESSAGES[flag] } : req?.messages.at(-1)?.from === "me" ? { action: "wait", reason: "Your message is already the latest one in this chat. Give them room to respond." } : out.nextMove,
    missingInfo: out.missingInfo,
    stage: out.stage?.plan.trim() ? { id: out.stage.id, plan: out.stage.plan.trim() } : undefined,
  };
}
