/**
 * RizzAI over any OpenAI-compatible Chat Completions API — Groq, Google
 * Gemini, OpenRouter, and others. These are the free-tier options; see
 * providers.ts for presets.
 *
 * Structured output: JSON mode is the widely supported common denominator,
 * so the JSON Schema goes in the system prompt and every response is
 * validated with zod, with one corrective retry.
 */
import { z } from "zod";
import type {
  ChatRequestParsed,
  ChatResponse,
  DatePlanRequestParsed,
  DatePlanResponse,
  ExtractResponse,
  ImageInput,
  OpenersResponse,
  Platform,
  ProfileReviewRequestParsed,
  ProfileReviewResponse,
  Preferences,
  SafetyFlag,
  SuggestRequestParsed,
  SuggestResponse,
  ToneId,
} from "@rizz/shared";
import { coachIssue, normalizeChat, normalizeCoach, prepareTurns } from "./chatShared.js";
import { normalizeSuggest } from "./claude.js";
import { buildDatePrompt, buildOpenersPrompt, buildProfilePrompt, buildSuggestPrompt, chatSystem, DATE_SYSTEM, EXTRACT_SYSTEM, OPENERS_SYSTEM, PROFILE_SYSTEM, SUGGEST_SYSTEM } from "./prompts.js";
import { ChatOut, CoachOut, DateOut, ExtractOut, OpenersOut, ProfileOut, SuggestOut } from "./schemas.js";
import { normalizeDate } from "./dateShared.js";
import { normalizeProfile } from "./profileShared.js";
import { AiUnavailableError, type RizzAI } from "./types.js";
import { suggestionIssue } from "./suggestionQuality.js";

export interface OpenAICompatConfig {
  /** For logs, e.g. "groq". */
  name: string;
  baseURL: string;
  apiKey: string;
  /** Model for text-only requests. */
  textModel: string;
  /** Model for requests with an image (screenshots). */
  visionModel: string;
  temperature?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type Msg = { role: "system" | "user" | "assistant"; content: string | Part[] };

const schemaText = (schema: z.ZodType) => JSON.stringify(z.toJSONSchema(schema), (key, value) => key === "$schema" || key === "description" ? undefined : value);
const OUTPUT_BUDGETS = new Map<z.ZodType, number>([[SuggestOut, 2000], [ChatOut, 1600], [CoachOut, 2000], [OpenersOut, 1400]]);

function jsonInstructions(schema: z.ZodType) {
  return `\n\nOutput format: respond with ONE JSON object and nothing else — no markdown, no code fences, no commentary. Match this JSON Schema; include fields marked required:\n${schemaText(schema)}`;
}

/** Some models wrap JSON in ```json fences or add a preamble despite instructions. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("no JSON object in response");
  }
}

const imagePart = (img: ImageInput): Part => ({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.data}` } });

export function createOpenAICompatAI(cfg: OpenAICompatConfig): RizzAI {
  const doFetch = cfg.fetch ?? fetch;
  const url = `${cfg.baseURL.replace(/\/+$/, "")}/chat/completions`;

  async function complete(model: string, messages: Msg[], maxTokens: number): Promise<string> {
    const started = Date.now();
    try {
      const text = await completeOnce(model, messages, maxTokens);
      console.log(`[ai] ${cfg.name} ${model} ok in ${Date.now() - started}ms`);
      return text;
    } catch (err) {
      const cause = (err as Error).cause as Error | undefined;
      console.warn(`[ai] ${cfg.name} ${model} failed after ${Date.now() - started}ms: ${cause?.message ?? (err as Error).message}`);
      throw err;
    }
  }

  async function completeOnce(model: string, messages: Msg[], maxTokens: number): Promise<string> {
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature: cfg.temperature ?? 0.8,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 18_000),
      });
    } catch (err) {
      const timedOut = (err as Error).name === "TimeoutError";
      throw new AiUnavailableError(timedOut ? "The AI took too long, try again" : "Could not reach the AI", new Error(`${cfg.name}: ${(err as Error).message}`));
    }

    if (!res.ok) {
      const cause = new Error(`${cfg.name} HTTP ${res.status}`);
      if (res.status === 429) throw new AiUnavailableError("AI is busy, try again in a moment", cause);
      if (res.status === 401 || res.status === 403) throw new AiUnavailableError("AI is temporarily unavailable", cause);
      if (res.status >= 500) throw new AiUnavailableError("AI is temporarily unavailable", cause);
      throw cause; // 400/404/413: our bug (bad model id, image too large) — surfaces as a 500
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string | null }; finish_reason?: string }[] };
    const choice = data.choices?.[0];
    const text = choice?.message?.content;
    if (!text) throw new AiUnavailableError("AI returned an empty response", new Error(`${cfg.name}: finish_reason=${choice?.finish_reason}`));
    return text;
  }

  /** One call plus one corrective retry if the JSON doesn't match the schema. */
  async function call<T extends z.ZodType>(schema: T, system: string, messages: Msg[], hasImage: boolean, quality?: (out: z.infer<T>) => string | undefined): Promise<z.infer<T>> {
    const model = hasImage ? cfg.visionModel : cfg.textModel;
    const convo: Msg[] = [{ role: "system", content: system + jsonInstructions(schema) }, ...messages];
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await complete(model, convo, OUTPUT_BUDGETS.get(schema) ?? 4000);
      try {
        const parsed = schema.safeParse(extractJson(text));
        if (parsed.success) {
          const issue = quality?.(parsed.data);
          if (!issue) return parsed.data;
          lastError = issue;
        } else lastError = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      } catch (err) {
        lastError = (err as Error).message;
      }
      convo.push(
        { role: "assistant", content: text },
        { role: "user", content: `That response was not valid (${lastError}). Reply again with only the corrected JSON object.` },
      );
    }
    throw new AiUnavailableError("AI returned an unusable response", new Error(`${cfg.name}: ${lastError}`));
  }

  return {
    async suggest(req: SuggestRequestParsed, forcedFlag: SafetyFlag): Promise<SuggestResponse> {
      const out = await call(SuggestOut, SUGGEST_SYSTEM, [{ role: "user", content: buildSuggestPrompt(req, forcedFlag) }], false, (out) => suggestionIssue(out.suggestions, req.count, out.safety.flag));
      return normalizeSuggest(out, req.count, forcedFlag, req);
    },

    async openers(args: { platform: Platform; tone: ToneId; bio?: string; image?: ImageInput; count: number; prefs: Preferences }): Promise<OpenersResponse> {
      const text: Part = { type: "text", text: buildOpenersPrompt({ ...args, hasImage: !!args.image }) };
      const content: Part[] = args.image ? [imagePart(args.image), text] : [text];
      const out = await call(OpenersOut, OPENERS_SYSTEM, [{ role: "user", content }], !!args.image);
      const blocked = out.safety.flag === "possible_minor";
      return { openers: blocked ? [] : out.openers.slice(0, args.count), hooks: out.hooks.slice(0, 6), safety: out.safety };
    },

    async extract(image: ImageInput, platformHint?: Platform): Promise<ExtractResponse> {
      const hint = platformHint ? `This screenshot is probably from ${platformHint}.` : "Identify the app if you can.";
      return call(
        ExtractOut,
        EXTRACT_SYSTEM,
        [{ role: "user", content: [imagePart(image), { type: "text", text: `${hint} Transcribe the conversation.` }] }],
        true,
      );
    },

    async datePlan(req: DatePlanRequestParsed): Promise<DatePlanResponse> {
      const out = await call(DateOut, DATE_SYSTEM, [{ role: "user", content: buildDatePrompt(req) }], false);
      return normalizeDate(out as DatePlanResponse);
    },

    async profileReview(req: ProfileReviewRequestParsed): Promise<ProfileReviewResponse> {
      const content: Part[] = req.images.flatMap((img, i): Part[] => [{ type: "text", text: `Photo ${i + 1}:` }, imagePart(img)]);
      content.push({ type: "text", text: buildProfilePrompt(req) });
      const out = await call(ProfileOut, PROFILE_SYSTEM, [{ role: "user", content }], req.images.length > 0);
      return normalizeProfile(out as ProfileReviewResponse, req);
    },

    async chat(req: ChatRequestParsed, forcedFlag: SafetyFlag): Promise<ChatResponse> {
      if (req.mode === "coach") {
        const out = await call(CoachOut, chatSystem(req.mode), prepareTurns(req), false, coachIssue);
        return normalizeCoach(out, req, forcedFlag);
      }
      const out = await call(ChatOut, chatSystem(req.mode), prepareTurns(req), false);
      return normalizeChat(out, req, forcedFlag);
    },
  };
}
