/**
 * Deterministic safety checks that run before (and after) the model.
 * The model also judges safety, but these rules are cheap, predictable and
 * can't be talked out of by anything written inside a chat.
 */
import type { ChatMessage, SafetyFlag } from "@rizz/shared";

const UNDERAGE_PATTERNS: RegExp[] = [
  // "i'm 16", "im 15", "i am 17" — but not "i'm 16 minutes away"
  /\bi(?:'|’)?m\s+(?:only\s+)?(1[0-7]|[5-9])\b(?!\s*(?:min|mins|minutes|hours?|hrs?|km|miles?|ft|feet|cm|%|k\b|\/10|out of))/i,
  /\bi\s+am\s+(?:only\s+)?(1[0-7]|[5-9])\b(?!\s*(?:min|mins|minutes|hours?|hrs?|km|miles?|ft|feet|cm|%|k\b|\/10|out of))/i,
  /\b(1[0-7]|[5-9])\s*(?:yo|y\/o|yrs?\s*old|years?\s*old)\b/i,
  /\b(?:in|at)\s+(?:the\s+)?(?:[5-9]th|1[0-2]th|10th|11th|12th)\s+(?:grade|class|std|standard)\b/i,
  // present tense only — adults talk about high school all the time
  /\b(?:i'?m|i am)\s+(?:still\s+)?(?:in\s+(?:middle|high)\s+school|a\s+(?:middle|high)\s+schooler)\b/i,
];

const NOT_INTERESTED_PATTERNS: RegExp[] = [
  /\bstop\s+(?:texting|messaging|dm'?ing|talking to)\s+me\b/i,
  /\bleave\s+me\s+alone\b/i,
  /\b(?:i'?m|i am)\s+not\s+interested\b/i,
  /\bnot\s+interested\b/i,
  /\bdon'?t\s+(?:text|message|dm|contact)\s+me\b/i,
  /\b(?:i'?ll|i will|gonna)\s+block\s+you\b/i,
  /\bgo\s+away\b/i,
  /\bplease\s+stop\b/i,
  /\bunmatch(?:ing)?\b/i,
];

export function mentionsMinor(texts: string[]): boolean {
  return texts.some((t) => UNDERAGE_PATTERNS.some((re) => re.test(t)));
}

/** Only recent messages count: a "not interested" 30 messages ago may have been resolved. */
export function saidNotInterested(messages: ChatMessage[], lookback = 4): boolean {
  return messages
    .filter((m) => m.from === "them")
    .slice(-lookback)
    .some((m) => NOT_INTERESTED_PATTERNS.some((re) => re.test(m.text)));
}

export interface Precheck {
  /** Hard stop — never generate. */
  block: boolean;
  /** Flag the model must honour; it can only raise severity, never lower it. */
  forcedFlag: SafetyFlag;
}

export function precheck(messages: ChatMessage[], extraTexts: string[] = []): Precheck {
  const all = [...messages.map((m) => m.text), ...extraTexts];
  if (mentionsMinor(all)) return { block: true, forcedFlag: "possible_minor" };
  if (saidNotInterested(messages)) return { block: false, forcedFlag: "not_interested" };
  return { block: false, forcedFlag: "none" };
}

export const SAFETY_MESSAGES: Record<SafetyFlag, string> = {
  none: "",
  not_interested:
    "They've said they're not interested. The best move is a kind, graceful exit — respecting that is what confident people do.",
  uncomfortable: "They seem uneasy. Ease off, keep it light, and give them space.",
  possible_minor:
    "This person may be under 18. Rizz AI can't help with this conversation.",
  user_harassing:
    "Your recent messages may come across as pushy. Slow down and give them room to reply.",
};
