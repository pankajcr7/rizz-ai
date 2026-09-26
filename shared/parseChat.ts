/**
 * Turn pasted chat text into structured messages.
 *
 * Handles:
 *   "me: hey" / "her: hi" / "Maya: hi"     — speaker prefixes
 *   "[12/03/24, 9:41 PM] Maya: hi"          — WhatsApp iOS export
 *   "12/03/2024, 21:41 - Maya: hi"          — WhatsApp Android export
 *   plain lines with no prefix              — treated as their messages
 * Lines without a prefix continue the previous message (multi-line texts).
 */
import type { ChatMessage } from "./contract";

const ME_ALIASES = new Set(["me", "you", "i", "myself", "mine"]);
const THEM_ALIASES = new Set(["her", "him", "them", "she", "he", "they", "match", "crush"]);

const WHATSAPP_PREFIX = /^\[?\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4},?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s*(?:[ap]\.?\s?m\.?)?\]?\s*(?:-\s*)?/i;
// "Name: text" — name up to 30 chars, no digits-only names, no URLs ("https://")
const MEDIA = /^<(?:media omitted|attached:.*)>$|^(?:image|video|audio|sticker) omitted$/i;
const SPEAKER = /^([^:\n]{1,30}?):\s+(.*)$/;

export interface ParsedChat {
  messages: ChatMessage[];
  /** Distinct speaker names seen, in order of appearance. */
  speakers: string[];
  theirName?: string;
}

export function parseChat(input: string, myName?: string): ParsedChat {
  const messages: ChatMessage[] = [];
  const owners: (string | undefined)[] = []; // speaker name per message
  const speakers: string[] = [];
  const mine = myName?.trim().toLowerCase();
  let sawPrefix = false;

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.replace(WHATSAPP_PREFIX, "").trim();
    if (!line || /messages and calls are end-to-end encrypted/i.test(line)) continue;

    const m = SPEAKER.exec(line);
    const name = m?.[1]?.trim();
    if (m && name && !/^https?$/i.test(name) && !/^\d+$/.test(name)) {
      if (MEDIA.test(m[2]!.trim())) continue;
      sawPrefix = true;
      const lower = name.toLowerCase();
      if (!speakers.includes(name)) speakers.push(name);
      const from = ME_ALIASES.has(lower) || lower === mine ? "me" : "them";
      messages.push({ from, text: m[2]!.trim() });
      owners.push(name);
      continue;
    }

    const last = messages[messages.length - 1];
    if (sawPrefix && last) {
      last.text = `${last.text}\n${line}`;
    } else {
      messages.push({ from: "them", text: line });
      owners.push(undefined);
    }
  }

  // Two named people and neither is an alias for "me": assume the second
  // speaker is the user (people usually paste starting with the other
  // person's message). The UI lets them swap if that's wrong.
  const named = speakers.filter((s) => !ME_ALIASES.has(s.toLowerCase()) && !THEM_ALIASES.has(s.toLowerCase()));
  const hasMe = messages.some((msg) => msg.from === "me");
  if (!hasMe && named.length === 2) {
    const meName = named[1]!;
    messages.forEach((msg, i) => {
      if (owners[i] === meName) msg.from = "me";
    });
    return { messages: messages.filter((x) => x.text), speakers, theirName: named[0] };
  }

  const theirName = named.find((s) => s.toLowerCase() !== mine);
  return { messages: messages.filter((x) => x.text), speakers, theirName };
}

/** Flip me/them — for when the parser guessed wrong. */
export function swapSides(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({ ...m, from: m.from === "me" ? "them" : "me" }));
}
