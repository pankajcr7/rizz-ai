import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { ChatRequestSchema } from "@rizz/shared";
import { normalizeChat, prepareTurns } from "../src/ai/chatShared.js";
import { createClaudeAI } from "../src/ai/claude.js";
import { COACH_SYSTEM, PRACTICE_SYSTEM } from "../src/ai/prompts.js";

const practice = ChatRequestSchema.parse({
  mode: "practice",
  persona: "sarcastic",
  prefs: { language: "hinglish" },
  turns: [
    { role: "assistant", content: "hey! finally someone with a dog pic 🐶" },
    { role: "user", content: "haha he's the real star" },
    { role: "user", content: "call me on 9876543210" },
  ],
});

describe("prepareTurns", () => {
  it("starts with the user, merges same-role turns, redacts and injects settings", () => {
    const turns = prepareTurns(practice);
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
    expect(turns[0]!.content).toContain("<settings>");
    expect(turns[0]!.content).toContain("Language: hinglish");
    expect(turns[0]!.content).toContain("Sarcastic");
    expect(turns[2]!.content).toBe("haha he's the real star\ncall me on [phone]");
  });
});

describe("normalizeChat", () => {
  const raw = { reply: " lol ok ", feedback: { score: 14.2, note: "n", better: "b" }, safety: { flag: "none" as const, message: "" } };

  it("clamps the score in practice mode", () => {
    expect(normalizeChat(raw, practice, "none")).toEqual({ reply: "lol ok", feedback: { score: 10, note: "n", better: "b" }, safety: { flag: "none", message: "" } });
  });

  it("drops feedback in coach mode", () => {
    const coach = ChatRequestSchema.parse({ turns: [{ role: "user", content: "hi" }] });
    expect(normalizeChat(raw, coach, "none").feedback).toBeNull();
  });

  it("replaces the reply when the model flags a minor", () => {
    const out = normalizeChat({ ...raw, safety: { flag: "possible_minor", message: "" } }, practice, "none");
    expect(out.reply).toMatch(/under 18/);
    expect(out.feedback).toBeNull();
  });
});

describe("prompts", () => {
  it("both chat modes carry safety limits and the request carries its language guide", () => {
    for (const p of [COACH_SYSTEM, PRACTICE_SYSTEM]) {
      expect(p).toContain("possible_minor");
    }
    expect(prepareTurns(practice)[0]!.content).toContain("romanized Hindi");
    expect(prepareTurns(practice)[0]!.content).not.toContain('"tanglish"');
  });
});

describe("Claude chat", () => {
  it("sends the conversation as alternating turns", async () => {
    const parse = vi.fn(async () => ({
      stop_reason: "end_turn",
      parsed_output: { reply: "acha ji 😏", feedback: { score: 7, note: "cute", better: "b" }, safety: { flag: "none", message: "" } },
    }));
    const client = { beta: { messages: { parse } } } as unknown as Anthropic;
    const res = await createClaudeAI({ model: "m", effort: "low", client }).chat(practice, "none");
    const params = (parse.mock.calls[0] as unknown[])[0] as { messages: { role: string }[]; system: { text: string }[] };
    expect(params.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(params.system[0]!.text).toBe(PRACTICE_SYSTEM);
    expect(res.reply).toBe("acha ji 😏");
  });
});
