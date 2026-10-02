import { describe, expect, it } from "vitest";
import { hasChatBoundary, keepAnalysis, parseChat, quotaResetLabel, shouldOfferDate, type ChatMessage, type SuggestResponse } from "@rizz/shared";
import { normalizeChat, normalizeCoach } from "../src/ai/chatShared.js";
import { ChatRequestSchema } from "@rizz/shared";
import { groundFillInText, suggestionIssue } from "../src/ai/suggestionQuality.js";

const original: SuggestResponse = { suggestions: [{ text: "hey", why: "short" }], vibe: { interest: 70, mood: "friendly", summary: "engaged", signals: [] }, safety: { flag: "none", message: "" }, coachTip: "Match the energy", memory: [], stage: { id: "talking", plan: "Get to know them" }, nextMove: { action: "reply", reason: "They asked a question" } };
describe("conversation experience regressions", () => {
  it("keeps scores and next move stable for a new tone but respects new safety flags", () => {
    const changed = { ...original, vibe: { ...original.vibe, interest: 60 }, suggestions: [{ text: "hello there", why: "warm" }] };
    expect(keepAnalysis(changed, original).vibe.interest).toBe(70);
    expect(keepAnalysis(changed, original).suggestions[0]!.text).toBe("hello there");
    const blocked = { ...changed, safety: { flag: "possible_minor" as const, message: "stop" } };
    expect(keepAnalysis(blocked, original)).toBe(blocked);
  });
  it("does not push a date after a single message, a boundary, or when waiting", () => {
    const one: ChatMessage[] = [{ from: "them", text: "I have a cat" }];
    expect(shouldOfferDate(original, one)).toBe(false);
    const chat: ChatMessage[] = Array.from({ length: 6 }, (_, i) => ({ from: i % 2 ? "them" : "me", text: "hello" }));
    expect(shouldOfferDate(original, chat)).toBe(true);
    const boundary = [...chat, { from: "them" as const, text: "please stop texting me" }];
    expect(hasChatBoundary(boundary)).toBe(true);
    expect(shouldOfferDate(original, boundary)).toBe(false);
    expect(shouldOfferDate({ ...original, nextMove: { action: "wait", reason: "space" } }, chat)).toBe(false);
  });
  it("formats midnight UTC as 5:30 AM in India and the real local time elsewhere", () => {
    expect(quotaResetLabel("2026-10-03T00:00:00Z", "Asia/Kolkata")).toMatch(/5:30/);
    expect(quotaResetLabel("2026-10-03T00:00:00Z", "America/Los_Angeles")).toMatch(/5:00|17:00/);
  });
  it("uses either chosen participant and never guesses from their ordering", () => {
    const text = "Rahul: hi\nMaya: what are you studying?";
    expect(parseChat(text).unresolvedSpeakers).toEqual(["Rahul", "Maya"]);
    expect(parseChat(text, "Rahul").messages.map((m) => m.from)).toEqual(["me", "them"]);
    expect(parseChat(text, "maya").messages.map((m) => m.from)).toEqual(["them", "me"]);
  });
  it("returns a friendly safety notice and removes practice rewards from flagged outputs", () => {
    const request = ChatRequestSchema.parse({ mode: "practice", turns: [{ role: "user", content: "test" }] });
    const result = normalizeChat({ reply: "Take a step back", feedback: { score: 10, note: "internal", better: "x" }, safety: { flag: "user_harassing", message: "User is seeking manipulative tactics after rejection." } }, request, "none");
    expect(result.safety.message).not.toContain("User is seeking");
    expect(result.feedback).toBeNull();
  });
  it("rejects empty and emoji-only duplicate alternatives while allowing different answers", () => {
    expect(suggestionIssue([], 3, "none")).toMatch(/fill-in/);
    expect(suggestionIssue([{ text: "hey!" }, { text: "hey 😏" }], 2, "none")).toMatch(/repeat/);
    expect(suggestionIssue([{ text: "I study [fill-in]. What about you?" }, { text: "[fill-in] — mostly surviving assignments." }], 2, "none")).toBeUndefined();
    expect(suggestionIssue([], 3, "possible_minor")).toBeUndefined();
    expect(groundFillInText("I’m a [fill-in]; weekends I’m usually hiking. What’s your favorite pastime?")).toBe("I’m a [fill-in]. What’s your favorite pastime?");
    expect(groundFillInText("I work in [fill-in] — keeps me busy.")).toBe("I work in [fill-in].");
    expect(groundFillInText("I'm [age] years old.")).toBe("I'm [age] years old.");
  });
  it("keeps coach advice and a usable question without an invented dog outing", () => {
    const req = ChatRequestSchema.parse({ mode: "coach", turns: [{ role: "user", content: "They asked about my dog. Ask or wait?" }] });
    const out = normalizeCoach({ recommendation: "Wait a bit.", evidence: "A question is thin evidence.", nextStep: "Keep getting to know them.", example: "Hey, my dog loved that walk! What's your favorite way to spend a weekend?", safety: { flag: "none", message: "" } }, req, "none");
    expect(out.reply).not.toContain("loved that walk");
    expect(out.reply).toContain("Try: What's your favorite way");
  });
});
