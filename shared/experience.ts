import type { ChatMessage, SuggestResponse } from "./contract";

const BOUNDARIES = [
  /\bstop\s+(?:texting|messaging|dm'?ing|talking to)\s+me\b/i,
  /\bleave\s+me\s+alone\b/i,
  /\bnot\s+interested\b/i,
  /\bdon'?t\s+(?:text|message|dm|contact)\s+me\b/i,
  /\b(?:i'?ll|i will|gonna)\s+block\s+you\b/i,
  /\bgo\s+away\b/i, /\bplease\s+stop\b/i, /\bunmatch(?:ing)?\b/i,
];

export function hasChatBoundary(messages: ChatMessage[], lookback = 4): boolean {
  return messages.filter((m) => m.from === "them").slice(-lookback).some((m) => BOUNDARIES.some((re) => re.test(m.text)));
}

export function shouldOfferDate(reply: SuggestResponse, messages: ChatMessage[]): boolean {
  return reply.safety.flag === "none" && !hasChatBoundary(messages) && !reply.missingInfo &&
    reply.vibe.interest >= 55 && messages.length >= 6 &&
    messages.filter((m) => m.from === "me").length >= 2 && messages.filter((m) => m.from === "them").length >= 2 &&
    messages.at(-1)?.from === "them" && reply.nextMove?.action !== "wait" && reply.nextMove?.action !== "end" &&
    (reply.stage?.id === "talking" || reply.stage?.id === "close");
}

/** Format the server's UTC reset instant in the reader's own timezone. */
export function quotaResetLabel(resetsAt?: string, timeZone?: string): string {
  if (!resetsAt || !Number.isFinite(Date.parse(resetsAt))) return "Check your profile for the next reset time.";
  const label = new Date(resetsAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short", ...(timeZone ? { timeZone } : {}) });
  return `Free replies reset ${label}.`;
}

/** Wording changes don't change the evidence in the same conversation. */
export function keepAnalysis(next: SuggestResponse, previous?: SuggestResponse): SuggestResponse {
  if (!previous || next.safety.flag !== previous.safety.flag) return next;
  return { ...next, vibe: previous.vibe, stage: previous.stage, nextMove: previous.nextMove, safety: previous.safety };
}
