/**
 * Live "read the whole chat" mode: the user scrolls up through a chat while
 * the phone reads each screen. These helpers stitch those overlapping screens
 * into one transcript and compute simple, honest stats about it.
 */
import type { ChatMessage } from "./contract";

/** One screen as read by on-device OCR, top to bottom. */
export type ChatFrame = { messages: ChatMessage[] };

const norm = (t: string) => t.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Same bubble seen on two screens? Bubbles cut off at the top or bottom edge
 * are read only partly, so a long enough fragment of the other counts too.
 */
function same(a: ChatMessage, b: ChatMessage): boolean {
  if (a.from !== b.from) return false;
  const x = norm(a.text);
  const y = norm(b.text);
  if (!x || !y) return a.text.trim() === b.text.trim();
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.length >= 8 && long.includes(short);
}

const longer = (a: ChatMessage, b: ChatMessage) => (b.text.length > a.text.length ? b : a);

/** A single matching message only counts as overlap when it's distinctive ("haha" isn't). */
const distinctive = (m: ChatMessage) => norm(m.text).length >= 6;

/** Largest k where the last k of `top` equal the first k of `bottom`. */
function overlap(top: ChatMessage[], bottom: ChatMessage[]): number {
  for (let k = Math.min(top.length, bottom.length); k >= 1; k--) {
    let ok = true;
    for (let i = 0; i < k && ok; i++) ok = same(top[top.length - k + i]!, bottom[i]!);
    if (ok && (k > 1 || distinctive(bottom[0]!))) return k;
  }
  return 0;
}

/** Index where `inner` appears inside `outer`, or -1. */
function containedAt(outer: ChatMessage[], inner: ChatMessage[]): number {
  for (let s = 0; s + inner.length <= outer.length; s++) {
    if (inner.every((m, i) => same(outer[s + i]!, m))) return s;
  }
  return -1;
}

/**
 * Stitch screens captured while the user scrolls (usually upward, sometimes
 * back down) into one ordered transcript. Frames are in capture order.
 * `gaps` counts screens that didn't overlap anything — the user scrolled
 * faster than the phone could read, so a few messages may be missing.
 */
export function stitchFrames(frames: ChatFrame[]): { messages: ChatMessage[]; gaps: number } {
  let acc: ChatMessage[] = [];
  let gaps = 0;
  for (const frame of frames) {
    const f = frame.messages.filter((m) => m.text.trim());
    if (!f.length) continue;
    if (!acc.length) {
      acc = [...f];
      continue;
    }
    const inside = f.length <= acc.length ? containedAt(acc, f) : -1;
    if (inside >= 0) {
      // Already have all of it (the user paused) — just keep fuller versions of cut-off bubbles.
      f.forEach((m, i) => (acc[inside + i] = longer(acc[inside + i]!, m)));
      continue;
    }
    const up = overlap(f, acc); // f is older: its bottom matches acc's top
    const down = overlap(acc, f); // f is newer: its top matches acc's bottom
    if (up >= down && up > 0) {
      for (let i = 0; i < up; i++) acc[i] = longer(acc[i]!, f[f.length - up + i]!);
      acc = [...f.slice(0, f.length - up), ...acc];
    } else if (down > 0) {
      for (let i = 0; i < down; i++) acc[acc.length - down + i] = longer(acc[acc.length - down + i]!, f[i]!);
      acc = [...acc, ...f.slice(down)];
    } else {
      // No overlap: the user scrolled up past a whole screen between reads.
      gaps++;
      acc = [...f, ...acc];
    }
  }
  return { messages: acc, gaps };
}

/** Most common value, ignoring nulls — e.g. the chat title read on several screens. */
export function mostCommon<T>(values: (T | null | undefined)[]): T | undefined {
  const counts = new Map<T, number>();
  for (const v of values) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | undefined;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

export type ChatStats = {
  total: number;
  mine: number;
  theirs: number;
  /** Share of all words that are theirs, 0-100. ~50 is balanced. */
  theirWordShare: number;
  myQuestions: number;
  theirQuestions: number;
  /** Times the user sent 3+ messages in a row with no reply. */
  myDoubleTexts: number;
  /** Who sent the last message. */
  lastFrom: "me" | "them" | null;
};

/** Plain counts only — the AI does the reading between the lines. */
export function chatStats(messages: ChatMessage[]): ChatStats {
  const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
  let myWords = 0;
  let theirWords = 0;
  let myQuestions = 0;
  let theirQuestions = 0;
  let myDoubleTexts = 0;
  let run = 0;
  for (const m of messages) {
    const q = m.text.includes("?");
    if (m.from === "me") {
      myWords += words(m.text);
      if (q) myQuestions++;
      run++;
      if (run === 3) myDoubleTexts++;
    } else {
      theirWords += words(m.text);
      if (q) theirQuestions++;
      run = 0;
    }
  }
  const mine = messages.filter((m) => m.from === "me").length;
  const totalWords = myWords + theirWords;
  return {
    total: messages.length,
    mine,
    theirs: messages.length - mine,
    theirWordShare: totalWords ? Math.round((theirWords / totalWords) * 100) : 0,
    myQuestions,
    theirQuestions,
    myDoubleTexts,
    lastFrom: messages.at(-1)?.from ?? null,
  };
}

/** One short line for the live panel, e.g. "86 messages · she writes 44% · asks you 7 questions". */
export function statsLine(s: ChatStats): string {
  const parts = [`${s.total} messages`, `they write ${s.theirWordShare}%`];
  parts.push(s.theirQuestions ? `ask you ${s.theirQuestions} question${s.theirQuestions === 1 ? "" : "s"}` : "no questions back");
  if (s.myDoubleTexts) parts.push(`you triple-texted ${s.myDoubleTexts}×`);
  return parts.join(" · ");
}
