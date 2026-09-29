import { describe, expect, it } from "vitest";
import { SuggestRequestSchema } from "@rizz/shared";
import { normalizeSuggest } from "../src/ai/claude.js";
import { buildSuggestPrompt, stageLine, SUGGEST_SYSTEM } from "../src/ai/prompts.js";

const req = (extra: object) => SuggestRequestSchema.parse({ tone: "smooth", messages: [{ from: "them", text: "hi" }], ...extra });

describe("conversation stage", () => {
  it("defaults to auto and teaches every stage in the (cacheable) system prompt", () => {
    expect(req({}).stage).toBe("auto");
    for (const id of ["first_dm", "new", "talking", "close"]) expect(SUGGEST_SYSTEM).toContain(`- ${id}:`);
  });

  it("uses the stage the user picked", () => {
    expect(buildSuggestPrompt(req({ stage: "first_dm" }), "none")).toContain("Conversation stage (chosen by the user): first_dm");
  });

  it("hints that a short chat the user started may be a first DM", () => {
    const short = req({ messages: [{ from: "me", text: "saw your story, where was that?" }, { from: "them", text: "goa" }] });
    expect(stageLine(short)).toMatch(/may be the very start \(a first DM\)/);
    // Their message first, a long chat, or known older history: no first-DM hint.
    expect(stageLine(req({}))).toBe("Conversation stage: decide from the chat.");
    const earlier = req({ messages: short.messages, earlier: [{ from: "them", text: "old stuff" }] });
    expect(stageLine(earlier)).toBe("Conversation stage: decide from the chat.");
  });

  it("returns the detected stage and plan, dropping empty plans", () => {
    const out = {
      suggestions: [{ text: "ahh lonavala, you go there often?", why: "Easy question" }],
      vibe: { interest: 60, mood: "friendly" as const, summary: "Warm", signals: [] },
      safety: { flag: "none" as const, message: "" },
      coachTip: "Stay curious.",
      memory: [],
      stage: { id: "first_dm" as const, plan: " find out what they like doing on weekends " },
    };
    expect(normalizeSuggest(out, 3, "none").stage).toEqual({ id: "first_dm", plan: "find out what they like doing on weekends" });
    expect(normalizeSuggest({ ...out, stage: { id: "new", plan: " " } }, 3, "none").stage).toBeUndefined();
    expect(normalizeSuggest({ ...out, stage: undefined }, 3, "none").stage).toBeUndefined();
  });
});
