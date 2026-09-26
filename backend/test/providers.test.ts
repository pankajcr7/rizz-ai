import { describe, expect, it, vi } from "vitest";
import { ChatRequestSchema, SuggestRequestSchema } from "@rizz/shared";
import { createOpenAICompatAI, extractJson } from "../src/ai/openaiCompat.js";
import { cleanEnv, createAIFromEnv, pickProvider, withFallback } from "../src/ai/providers.js";
import { AiUnavailableError, type RizzAI } from "../src/ai/types.js";

const suggestReq = SuggestRequestSchema.parse({ tone: "funny", messages: [{ from: "them", text: "hey" }] });

const good = {
  suggestions: [{ text: "hey yourself 😄", why: "mirrors" }],
  vibe: { interest: 60, mood: "friendly", summary: "ok", signals: [] },
  safety: { flag: "none", message: "" },
  coachTip: "tip",
};

function fakeFetch(...bodies: (object | string | { status: number; text: string })[]) {
  const calls: { url: string; body: any }[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    const next = bodies.shift();
    if (next && typeof next === "object" && "status" in next) return new Response(next.text, { status: next.status });
    const content = typeof next === "string" ? next : JSON.stringify(next);
    return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }), { status: 200 });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const cfg = (f: typeof fetch) => ({ name: "test", baseURL: "https://api.example.com/v1/", apiKey: "k", textModel: "text-m", visionModel: "vision-m", fetch: f });

describe("extractJson", () => {
  it("handles fences and preambles", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2}')).toEqual({ a: 2 });
    expect(() => extractJson("nope")).toThrow();
  });
});

describe("createOpenAICompatAI", () => {
  it("sends JSON mode with the schema in the system prompt and parses the answer", async () => {
    const { fn, calls } = fakeFetch(good);
    const res = await createOpenAICompatAI(cfg(fn)).suggest(suggestReq, "none");
    expect(res.suggestions[0]!.text).toBe("hey yourself 😄");
    expect(calls[0]!.url).toBe("https://api.example.com/v1/chat/completions");
    expect(calls[0]!.body.model).toBe("text-m");
    expect(calls[0]!.body.response_format).toEqual({ type: "json_object" });
    expect(calls[0]!.body.messages[0].content).toContain('"coachTip"');
  });

  it("retries once when the JSON doesn't match the schema", async () => {
    const { fn, calls } = fakeFetch({ suggestions: "oops" }, good);
    const res = await createOpenAICompatAI(cfg(fn)).suggest(suggestReq, "none");
    expect(res.coachTip).toBe("tip");
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body.messages.at(-1).content).toMatch(/not valid/);
  });

  it("gives up after the retry", async () => {
    const { fn } = fakeFetch("not json", "still not json");
    await expect(createOpenAICompatAI(cfg(fn)).suggest(suggestReq, "none")).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it("maps 429 / 401 / 5xx to AiUnavailableError and 400 to a plain error", async () => {
    for (const status of [429, 401, 503]) {
      const { fn } = fakeFetch({ status, text: "x" });
      await expect(createOpenAICompatAI(cfg(fn)).suggest(suggestReq, "none")).rejects.toBeInstanceOf(AiUnavailableError);
    }
    const { fn } = fakeFetch({ status: 400, text: "bad model" });
    const err = await createOpenAICompatAI(cfg(fn)).suggest(suggestReq, "none").catch((e) => e);
    expect(err).not.toBeInstanceOf(AiUnavailableError);
    expect(err.message).toMatch(/400/);
  });

  it("uses the vision model and a data URL for screenshots", async () => {
    const { fn, calls } = fakeFetch({ platform: "instagram", theirName: null, messages: [] });
    await createOpenAICompatAI(cfg(fn)).extract({ mediaType: "image/png", data: "A".repeat(200) });
    expect(calls[0]!.body.model).toBe("vision-m");
    expect(calls[0]!.body.messages[1].content[0].image_url.url).toMatch(/^data:image\/png;base64,AAAA/);
  });

  it("runs chat mode as a multi-turn conversation", async () => {
    const { fn, calls } = fakeFetch({ reply: "haha acha", feedback: { score: 8, note: "n", better: "b" }, safety: { flag: "none", message: "" } });
    const req = ChatRequestSchema.parse({ mode: "practice", turns: [{ role: "user", content: "hi" }, { role: "assistant", content: "hey" }, { role: "user", content: "kya scene?" }] });
    const res = await createOpenAICompatAI(cfg(fn)).chat(req, "none");
    expect(calls[0]!.body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(res.feedback?.score).toBe(8);
  });
});

describe("provider selection", () => {
  it("prefers Groq, then Gemini, then OpenRouter, then Claude", () => {
    expect(pickProvider({ GROQ_API_KEY: "g", ANTHROPIC_API_KEY: "a" })).toBe("groq");
    expect(pickProvider({ GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a" })).toBe("gemini");
    expect(pickProvider({ ANTHROPIC_API_KEY: "a" })).toBe("claude");
    expect(pickProvider({})).toBeNull();
    expect(pickProvider({ AI_PROVIDER: "claude", GROQ_API_KEY: "g" })).toBe("claude");
    expect(() => pickProvider({ AI_PROVIDER: "gpt9000" })).toThrow(/Unknown/);
  });

  it("treats blank .env values as unset", () => {
    const env = cleanEnv({ GROQ_API_KEY: "g", AI_TEXT_MODEL: "", CORS_ORIGINS: "  ", AI_PROVIDER: "" });
    expect(env).toEqual({ GROQ_API_KEY: "g" });
    expect(pickProvider(env)).toBe("groq");
  });

  it("explains what's missing", () => {
    expect(() => createAIFromEnv({})).toThrow(/GROQ_API_KEY/);
    expect(() => createAIFromEnv({ AI_PROVIDER: "gemini" })).toThrow(/GEMINI_API_KEY/);
    expect(createAIFromEnv({ GROQ_API_KEY: "g", GEMINI_API_KEY: "m", AI_FALLBACK: "gemini" }).description).toBe("groq (fallback: gemini)");
  });
});

describe("withFallback", () => {
  const ok = { suggest: vi.fn(async () => "fallback-ok") } as unknown as RizzAI;

  it("uses the fallback only when the primary is unavailable", async () => {
    const busy = { suggest: vi.fn(async () => { throw new AiUnavailableError("busy"); }) } as unknown as RizzAI;
    expect(await withFallback(busy, ok).suggest(suggestReq, "none")).toBe("fallback-ok");

    const bug = { suggest: vi.fn(async () => { throw new Error("bad request"); }) } as unknown as RizzAI;
    await expect(withFallback(bug, ok).suggest(suggestReq, "none")).rejects.toThrow("bad request");
  });
});
