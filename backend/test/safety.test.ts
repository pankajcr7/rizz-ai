import { describe, expect, it } from "vitest";
import { mentionsMinor, precheck, saidNotInterested } from "../src/safety/guardrails.js";
import { redact } from "../src/safety/redact.js";
import { mergeFlag } from "../src/ai/claude.js";

describe("mentionsMinor", () => {
  it.each([
    "i'm 16 lol",
    "im 15",
    "I am 17 btw",
    "16 years old",
    "15yo",
    "i'm in 10th grade",
    "im still in high school",
    "I’m 14",
  ])("flags %j", (text) => expect(mentionsMinor([text])).toBe(true));

  it.each([
    "i'm 16 minutes away",
    "i'm 22",
    "I am 19 and I love hiking",
    "back in high school i played soccer",
    "i'm 5 ft 4",
    "my little sister is 15",
    "rate it i'm 9/10",
    "i was 16 when i learned to drive",
  ])("does not flag %j", (text) => expect(mentionsMinor([text])).toBe(false));
});

describe("saidNotInterested", () => {
  it("detects a recent no from them", () => {
    expect(
      saidNotInterested([
        { from: "me", text: "wanna hang?" },
        { from: "them", text: "sorry, not interested" },
      ]),
    ).toBe(true);
  });

  it("ignores the user's own messages", () => {
    expect(saidNotInterested([{ from: "me", text: "please stop being so cute" }])).toBe(false);
  });

  it("only looks at recent messages from them", () => {
    const old = [{ from: "them" as const, text: "leave me alone" }];
    const later = Array.from({ length: 5 }, (_, i) => ({ from: "them" as const, text: `haha ok ${i}` }));
    expect(saidNotInterested([...old, ...later])).toBe(false);
  });
});

describe("precheck", () => {
  it("blocks on a minor anywhere, including notes", () => {
    const r = precheck([{ from: "them", text: "hey" }], ["she said she's 16 years old"]);
    expect(r).toEqual({ block: true, forcedFlag: "possible_minor" });
  });

  it("forces not_interested without blocking", () => {
    const r = precheck([{ from: "them", text: "stop texting me" }]);
    expect(r).toEqual({ block: false, forcedFlag: "not_interested" });
  });
});

describe("mergeFlag", () => {
  it("lets the model escalate but never clear", () => {
    expect(mergeFlag("not_interested", "none")).toBe("not_interested");
    expect(mergeFlag("none", "uncomfortable")).toBe("uncomfortable");
    expect(mergeFlag("not_interested", "possible_minor")).toBe("possible_minor");
  });
});

describe("redact", () => {
  it("removes phone numbers and emails", () => {
    expect(redact("text me at +91 98765 43210 or a.b@gmail.com")).toBe("text me at [phone] or [email]");
    expect(redact("(555) 123-4567")).toBe("[phone]");
  });

  it("keeps short numbers", () => {
    expect(redact("i'm 23 and 5'9, see you at 7:30")).toBe("i'm 23 and 5'9, see you at 7:30");
  });
});
