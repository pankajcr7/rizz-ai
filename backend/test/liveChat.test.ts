import { describe, expect, it } from "vitest";
import { ChatRequestSchema, SuggestRequestSchema, chatStats, mostCommon, statsLine, stitchFrames, type ChatMessage } from "@rizz/shared";
import { buildChatContext, buildSuggestPrompt, recentWithin } from "../src/ai/prompts.js";

const me = (text: string): ChatMessage => ({ from: "me", text });
const them = (text: string): ChatMessage => ({ from: "them", text });

describe("stitchFrames", () => {
  it("prepends older screens while scrolling up, without duplicating the overlap", () => {
    const newest = [them("ok but what about goa"), me("goa in december is elite"), them("true true"), me("so you in?")];
    const older = [them("where should we go this winter"), me("mountains or beach?"), them("ok but what about goa"), me("goa in december is elite")];
    const oldest = [me("heyy how was the trip"), them("sooo good"), them("where should we go this winter")];
    const r = stitchFrames([{ messages: newest }, { messages: older }, { messages: oldest }]);
    expect(r.gaps).toBe(0);
    expect(r.messages.map((m) => m.text)).toEqual([
      "heyy how was the trip",
      "sooo good",
      "where should we go this winter",
      "mountains or beach?",
      "ok but what about goa",
      "goa in december is elite",
      "true true",
      "so you in?",
    ]);
  });

  it("keeps the full text of a bubble that was cut off at the screen edge", () => {
    const a = [them("december is elite honestly"), me("so you in?")]; // top bubble only partly visible
    const b = [them("wait have you been to goa? december is elite honestly"), me("so you in?")];
    const r = stitchFrames([{ messages: a }, { messages: b }]);
    expect(r.messages).toEqual(b);
  });

  it("ignores repeated screens when the user pauses, and appends when scrolling back down", () => {
    const a = [them("first"), me("second message here"), them("third message here")];
    const down = [them("third message here"), me("fourth message here")];
    const r = stitchFrames([{ messages: a }, { messages: a.slice(1) }, { messages: down }]);
    expect(r.messages.map((m) => m.text)).toEqual(["first", "second message here", "third message here", "fourth message here"]);
  });

  it("doesn't treat a short common word as overlap, and counts gaps", () => {
    const r = stitchFrames([{ messages: [them("haha"), me("newer one")] }, { messages: [me("older one"), them("haha")] }]);
    expect(r.gaps).toBe(1);
    expect(r.messages).toHaveLength(4);
  });

  it("never matches bubbles from different senders", () => {
    const r = stitchFrames([{ messages: [me("see you tomorrow then")] }, { messages: [them("see you tomorrow then")] }]);
    expect(r.messages).toHaveLength(2);
  });
});

describe("chat stats", () => {
  it("counts balance, questions and triple texts", () => {
    const s = chatStats([them("hey how are you?"), me("good"), me("wbu"), me("hello??"), them("busy day, you?")]);
    expect(s).toMatchObject({ total: 5, mine: 3, theirs: 2, theirQuestions: 2, myQuestions: 1, myDoubleTexts: 1, lastFrom: "them" });
    expect(s.theirWordShare).toBe(70);
    expect(statsLine(s)).toBe("5 messages · they write 70% · ask you 2 questions · you triple-texted 1×");
  });

  it("picks the most common chat title", () => {
    expect(mostCommon([null, "Maya", "Maya ✨", "Maya"])).toBe("Maya");
    expect(mostCommon([null, undefined])).toBeUndefined();
  });
});

describe("history in prompts", () => {
  it("keeps the newest messages within the budget", () => {
    const msgs = Array.from({ length: 50 }, (_, i) => them(`message number ${i}`));
    const { kept, dropped } = recentWithin(msgs, 200);
    expect(kept.at(-1)!.text).toBe("message number 49");
    expect(dropped + kept.length).toBe(50);
    expect(kept.reduce((n, m) => n + m.text.length + 8, 0)).toBeLessThanOrEqual(200);
  });

  it("adds earlier history to the suggest prompt", () => {
    const req = SuggestRequestSchema.parse({ tone: "funny", messages: [them("so?")], earlier: [them("i love momos"), me("same")] });
    const p = buildSuggestPrompt(req, "none");
    expect(p).toContain("<earlier_history>\nTHEM: i love momos\nME: same\n</earlier_history>");
    expect(p.indexOf("earlier_history")).toBeLessThan(p.indexOf("<transcript>"));
  });

  it("gives the coach the chat being asked about", () => {
    const req = ChatRequestSchema.parse({
      turns: [{ role: "user", content: "is she into me?" }],
      context: { platform: "instagram", theirName: "Maya", messages: [them("call me at 98765 43210")] },
    });
    const ctx = buildChatContext(req);
    expect(ctx).toContain("instagram chat with Maya");
    expect(ctx).toContain("<their_chat>");
    expect(ctx).not.toContain("98765"); // numbers are redacted
    // Practice mode never includes a real chat.
    const practice = ChatRequestSchema.parse({ mode: "practice", turns: [{ role: "user", content: "hey" }], context: req.context });
    expect(buildChatContext(practice)).not.toContain("their_chat");
  });
});
