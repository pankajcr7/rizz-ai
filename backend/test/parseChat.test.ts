import { describe, expect, it } from "vitest";
import { parseChat, swapSides } from "@rizz/shared";

describe("parseChat", () => {
  it("parses me/her prefixes and multi-line messages", () => {
    const r = parseChat("Her: hey stranger\nMe: hey you 👀\nhow was the concert\nHer: SO good");
    expect(r.messages).toEqual([
      { from: "them", text: "hey stranger" },
      { from: "me", text: "hey you 👀\nhow was the concert" },
      { from: "them", text: "SO good" },
    ]);
  });

  it("treats unprefixed text as their message", () => {
    expect(parseChat("do you like dogs?\nor cats").messages).toEqual([
      { from: "them", text: "do you like dogs?" },
      { from: "them", text: "or cats" },
    ]);
  });

  it("parses WhatsApp exports and guesses the user as the second speaker", () => {
    const text = [
      "12/03/2024, 21:41 - Messages and calls are end-to-end encrypted.",
      "12/03/2024, 21:41 - Maya: are you coming saturday?",
      "12/03/2024, 21:42 - Rahul: depends who's asking 😏",
      "12/03/2024, 21:42 - Maya: <Media omitted>",
      "[12/03/24, 9:43 PM] Maya: me obviously",
    ].join("\n");
    const r = parseChat(text);
    expect(r.theirName).toBe("Maya");
    expect(r.messages).toEqual([
      { from: "them", text: "are you coming saturday?" },
      { from: "me", text: "depends who's asking 😏" },
      { from: "them", text: "me obviously" },
    ]);
  });

  it("uses the user's own name when given", () => {
    const r = parseChat("Rahul: hi\nMaya: hello", "rahul");
    expect(r.messages.map((m) => m.from)).toEqual(["me", "them"]);
    expect(r.theirName).toBe("Maya");
  });

  it("doesn't treat URLs as speakers", () => {
    const r = parseChat("Me: check this\nhttps://example.com/x");
    expect(r.messages).toEqual([{ from: "me", text: "check this\nhttps://example.com/x" }]);
  });

  it("swaps sides", () => {
    expect(swapSides([{ from: "me", text: "a" }, { from: "them", text: "b" }])).toEqual([
      { from: "them", text: "a" },
      { from: "me", text: "b" },
    ]);
  });
});
