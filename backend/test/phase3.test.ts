import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { DatePlanRequestSchema, LanguageSchema, SuggestRequestSchema } from "@rizz/shared";
import { createClaudeAI } from "../src/ai/claude.js";
import { normalizeDate } from "../src/ai/dateShared.js";
import { buildDatePrompt, buildSuggestPrompt, DATE_SYSTEM, SUGGEST_SYSTEM } from "../src/ai/prompts.js";
import { createGroqTranscriber, isLikelySilence } from "../src/ai/transcribe.js";
import { AiUnavailableError } from "../src/ai/types.js";

describe("Indian code-mix languages", () => {
  it("are accepted and included in the selected language settings", () => {
    for (const l of ["tanglish", "tenglish", "benglish", "manglish", "kanglish", "punglish"]) {
      expect(LanguageSchema.parse(l)).toBe(l);
      const request = SuggestRequestSchema.parse({ tone: "smooth", messages: [{ from: "them", text: "hello" }], prefs: { language: LanguageSchema.parse(l) } });
      expect(buildSuggestPrompt(request, "none")).toContain(`"${l}"`);
    }
  });
});

describe("ghost risk", () => {
  it("is normalised onto a 0-100 scale", async () => {
    const parse = vi.fn(async () => ({
      stop_reason: "end_turn",
      parsed_output: {
        suggestions: [{ text: "a", why: "b" }],
        vibe: { interest: 40, mood: "dry", summary: "s", signals: [], ghost: { risk: 0.7, reason: "one-word replies", fix: "ask something fun" } },
        safety: { flag: "none", message: "" },
        coachTip: "t",
      },
    }));
    const client = { beta: { messages: { parse } } } as unknown as Anthropic;
    const req = SuggestRequestSchema.parse({ tone: "smooth", count: 1, messages: [{ from: "them", text: "k" }] });
    const res = await createClaudeAI({ model: "m", effort: "low", client }).suggest(req, "none");
    expect(res.vibe.ghost).toEqual({ risk: 70, reason: "one-word replies", fix: "ask something fun" });
    expect(SUGGEST_SYSTEM).toContain("Ghost risk");
  });
});

describe("date planner", () => {
  it("prompt carries city, budget, vibe, memory and the chat (redacted)", () => {
    const req = DatePlanRequestSchema.parse({
      city: "Chennai",
      budget: "low",
      vibe: "romantic",
      memory: ["loves filter coffee"],
      messages: [{ from: "them", text: "my number is 9876543210" }],
    });
    const p = buildDatePrompt(req);
    for (const s of ["City: Chennai", "Budget: low", "Vibe wanted: romantic", "- loves filter coffee", "[phone]"]) expect(p).toContain(s);
    expect(DATE_SYSTEM).toContain("Never invent business names");
  });

  it("normalises: max 3 ideas, drops incomplete ones, empties for minors", () => {
    const idea = { title: "t", emoji: "☕", why: "w", where: "a café", cost: "₹", ask: "coffee sat?" };
    const out = normalizeDate({ ideas: [idea, { ...idea, ask: "" }, idea, idea, idea], tip: "x", safety: { flag: "none", message: "" } });
    expect(out.ideas).toHaveLength(3);
    const minor = normalizeDate({ ideas: [idea], tip: "x", safety: { flag: "possible_minor", message: "" } });
    expect(minor.ideas).toEqual([]);
    expect(minor.safety.message).toMatch(/under 18/);
  });
});

describe("Groq transcriber", () => {
  it("posts multipart audio to Whisper with an ISO language code", async () => {
    let form: FormData | undefined;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      form = init.body as FormData;
      return new Response(JSON.stringify({ text: " hello there " }), { status: 200 });
    });
    const t = createGroqTranscriber({ apiKey: "k", fetch: fetchMock as unknown as typeof fetch });
    expect(await t.transcribe(Buffer.from("abc"), "audio/webm", "hindi")).toBe("hello there");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(form!.get("model")).toBe("whisper-large-v3-turbo");
    expect(form!.get("language")).toBe("hi");
    expect((form!.get("file") as File).name).toBe("voice.webm");
  });

  it("lets code-mixed languages auto-detect and maps busy errors", async () => {
    let form: FormData | undefined;
    const ok = vi.fn(async (_u: string, init: RequestInit) => {
      form = init.body as FormData;
      return new Response(JSON.stringify({ text: "enna da" }));
    });
    await createGroqTranscriber({ apiKey: "k", fetch: ok as unknown as typeof fetch }).transcribe(Buffer.from("a"), "audio/m4a", "tanglish");
    expect(form!.get("language")).toBeNull();

    const busy = vi.fn(async () => new Response("slow down", { status: 429 }));
    await expect(createGroqTranscriber({ apiKey: "k", fetch: busy as unknown as typeof fetch }).transcribe(Buffer.from("a"), "audio/m4a")).rejects.toBeInstanceOf(AiUnavailableError);
  });
});

describe("silence hallucinations", () => {
  it("treats Whisper's silence phrases in short clips as nothing", async () => {
    expect(isLikelySilence(" Thank you. ", 1500)).toBe(true);
    expect(isLikelySilence("Thanks for watching!", 5000)).toBe(true);
    expect(isLikelySilence("", 90_000)).toBe(true);
    // A real, longer recording saying thank you is kept.
    expect(isLikelySilence("Thank you.", 40_000)).toBe(false);
    expect(isLikelySilence("pineapple on pizza, yes or no?", 1500)).toBe(false);

    const f = vi.fn(async () => new Response(JSON.stringify({ text: " Thank you." })));
    const t = createGroqTranscriber({ apiKey: "k", fetch: f as unknown as typeof fetch });
    expect(await t.transcribe(Buffer.alloc(1458), "audio/webm")).toBe("");
  });
});
