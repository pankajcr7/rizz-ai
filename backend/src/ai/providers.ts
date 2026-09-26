/**
 * Pick the AI provider from environment variables.
 *
 *   AI_PROVIDER=groq | gemini | openrouter | claude | custom   (default: first one with a key, in that order)
 *   AI_FALLBACK=gemini                                          (optional: used when the primary is busy/down)
 *
 * Free-tier notes (checked Sept 2026):
 *   groq       — free, no card, very fast; doesn't retain data by default. Best default.
 *   gemini     — free, no card, biggest limits, but free-tier prompts may be used for training
 *                and read by human reviewers. Use only with test data, or enable billing.
 *   openrouter — free models capped at ~50 requests/day. Last resort.
 *   claude     — paid, best quality.
 */
import { createClaudeAI } from "./claude.js";
import { createOpenAICompatAI } from "./openaiCompat.js";
import { AiUnavailableError, type RizzAI } from "./types.js";

type Env = Record<string, string | undefined>;

/** Blank lines in .env ("CORS_ORIGINS=") mean "use the default", not "empty string". */
export function cleanEnv(env: Env): Env {
  return Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v.trim() !== ""));
}
export type ProviderName = "groq" | "gemini" | "openrouter" | "claude" | "custom";

const PRESETS = {
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    keyVar: "GROQ_API_KEY",
    textModel: "openai/gpt-oss-120b",
    visionModel: "qwen/qwen3.8-27b",
  },
  gemini: {
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyVar: "GEMINI_API_KEY",
    textModel: "gemini-3.5-flash",
    visionModel: "gemini-3.5-flash",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    keyVar: "OPENROUTER_API_KEY",
    textModel: "qwen/qwen3.8-27b:free",
    visionModel: "qwen/qwen3.8-27b:free",
  },
} as const;

function build(name: ProviderName, env: Env): RizzAI {
  if (name === "claude") {
    if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) throw new Error("AI_PROVIDER=claude needs ANTHROPIC_API_KEY");
    return createClaudeAI({
      model: env.RIZZ_MODEL ?? "claude-opus-5",
      effort: (env.RIZZ_EFFORT as "low" | "medium" | "high" | undefined) ?? "low",
    });
  }
  if (name === "custom") {
    const { AI_BASE_URL, AI_API_KEY, AI_TEXT_MODEL } = env;
    if (!AI_BASE_URL || !AI_API_KEY || !AI_TEXT_MODEL) throw new Error("AI_PROVIDER=custom needs AI_BASE_URL, AI_API_KEY and AI_TEXT_MODEL");
    return createOpenAICompatAI({
      name: "custom",
      baseURL: AI_BASE_URL,
      apiKey: AI_API_KEY,
      textModel: AI_TEXT_MODEL,
      visionModel: env.AI_VISION_MODEL ?? AI_TEXT_MODEL,
    });
  }
  const p = PRESETS[name];
  const apiKey = env[p.keyVar];
  if (!apiKey) throw new Error(`AI_PROVIDER=${name} needs ${p.keyVar}`);
  return createOpenAICompatAI({
    name,
    baseURL: p.baseURL,
    apiKey,
    // Model ids change often on free tiers — override without a code change.
    textModel: env.AI_TEXT_MODEL ?? p.textModel,
    visionModel: env.AI_VISION_MODEL ?? p.visionModel,
  });
}

/** Retry on the fallback provider when the primary is rate-limited or down. */
export function withFallback(primary: RizzAI, fallback: RizzAI): RizzAI {
  const wrap =
    <A extends unknown[], R>(fn: (ai: RizzAI) => (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(primary)(...args);
      } catch (err) {
        if (!(err instanceof AiUnavailableError)) throw err;
        return fn(fallback)(...args);
      }
    };
  return {
    suggest: wrap((ai) => ai.suggest.bind(ai)),
    openers: wrap((ai) => ai.openers.bind(ai)),
    extract: wrap((ai) => ai.extract.bind(ai)),
    chat: wrap((ai) => ai.chat.bind(ai)),
    profileReview: wrap((ai) => ai.profileReview.bind(ai)),
    datePlan: wrap((ai) => ai.datePlan.bind(ai)),
  };
}

export function pickProvider(env: Env): ProviderName | null {
  const explicit = env.AI_PROVIDER?.trim().toLowerCase();
  if (explicit) {
    if (!["groq", "gemini", "openrouter", "claude", "custom"].includes(explicit)) throw new Error(`Unknown AI_PROVIDER "${explicit}"`);
    return explicit as ProviderName;
  }
  if (env.GROQ_API_KEY) return "groq";
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.OPENROUTER_API_KEY) return "openrouter";
  if (env.ANTHROPIC_API_KEY) return "claude";
  return null;
}

export function createAIFromEnv(env: Env): { ai: RizzAI; description: string } {
  const primaryName = pickProvider(env);
  if (!primaryName) {
    throw new Error("No AI key found. Set GROQ_API_KEY (free: https://console.groq.com/keys) in backend/.env");
  }
  const primary = build(primaryName, env);
  const fallbackName = env.AI_FALLBACK?.trim().toLowerCase() as ProviderName | undefined;
  if (!fallbackName || fallbackName === primaryName) return { ai: primary, description: primaryName };
  return { ai: withFallback(primary, build(fallbackName, env)), description: `${primaryName} (fallback: ${fallbackName})` };
}
