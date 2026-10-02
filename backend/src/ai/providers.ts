/**
 * Pick the AI provider from environment variables.
 *
 *   AI_PROVIDER=groq | gemini | openrouter | claude | custom   (default: first one with a key, in that order)
 *   AI_FALLBACK=auto | none | provider                           (default: all configured backups)
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
import { withCapacity } from "./capacity.js";

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

function build(name: ProviderName, env: Env, primary = true): RizzAI {
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
    textModel: env[`${name.toUpperCase()}_TEXT_MODEL`] ?? (primary ? env.AI_TEXT_MODEL : undefined) ?? p.textModel,
    visionModel: env[`${name.toUpperCase()}_VISION_MODEL`] ?? (primary ? env.AI_VISION_MODEL : undefined) ?? p.visionModel,
  });
}

/** Retry on the fallback provider when the primary is rate-limited or down. */
export function withFallback(primary: RizzAI, fallback: RizzAI): RizzAI {
  let retryPrimaryAt = 0;
  const wrap =
    <A extends unknown[], R>(fn: (ai: RizzAI) => (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      if (Date.now() < retryPrimaryAt) return fn(fallback)(...args);
      try {
        return await fn(primary)(...args);
      } catch (err) {
        if (!(err instanceof AiUnavailableError)) throw err;
        retryPrimaryAt = Date.now() + 30_000;
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
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return "claude";
  return null;
}

export function createAIFromEnv(env: Env): { ai: RizzAI; description: string } {
  const primaryName = pickProvider(env);
  if (!primaryName) {
    throw new Error("No AI key found. Set GROQ_API_KEY (free: https://console.groq.com/keys) in backend/.env");
  }
  const primary = build(primaryName, env);
  const setting = env.AI_FALLBACK?.trim().toLowerCase();
  const available: ProviderName[] = ["groq", "gemini", "openrouter", "claude"];
  const hasKey = (name: ProviderName) => name === "claude" ? !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) : !!env[PRESETS[name as keyof typeof PRESETS]?.keyVar ?? "AI_API_KEY"];
  if (setting && setting !== "auto" && setting !== "none" && ![...available, "custom"].includes(setting as ProviderName)) throw new Error(`Unknown AI_FALLBACK "${setting}"`);
  const names = setting === "none" ? [] : setting && setting !== "auto" ? [setting as ProviderName] : available.filter(hasKey);
  const fallbacks = names.filter((n) => n !== primaryName);
  let ai = primary;
  if (fallbacks.length) {
    let backup = build(fallbacks.at(-1)!, env, false);
    for (const name of fallbacks.slice(0, -1).reverse()) backup = withFallback(build(name, env, false), backup);
    ai = withFallback(primary, backup);
  }
  return { ai: withCapacity(ai), description: fallbacks.length ? `${primaryName} (fallback: ${fallbacks.join(" → ")})` : primaryName };
}
