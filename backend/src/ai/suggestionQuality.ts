import type { SafetyFlag } from "@rizz/shared";

/** A fill-in answer must not acquire made-up hobbies, workload or plans around it. */
export function groundFillInText(text: string): string {
  const slot = /\[[^\]]+\]/.exec(text);
  if (!slot || slot.index === undefined) return text;
  // Preserve the answer through its last fill-in, including common grammatical units.
  const slots = [...text.matchAll(/\[[^\]]+\]/g)];
  const last = slots.at(-1)!;
  const end = last.index! + last[0].length;
  const rest = text.slice(end);
  const unit = rest.match(/^\s*(?:years? old|years?|months?|hours?|minutes?)\b/i)?.[0] ?? "";
  const answer = text.slice(0, end) + unit;
  // Keep a separate question, never a new declarative personal assertion.
  const question = rest.match(/(?:^|[.!;—–])\s*([^.!?;—–]*\?)/)?.[1]?.trim();
  const safeQuestion = question && /^(?:what|how|where|when|which|who|why|do|did|are|is|any|have|got|and you|you|wbu|aur|tum|aap|kya|kaise|kahan)\b/i.test(question);
  return `${answer.trim().replace(/[.!;,—–]+$/, "")}.${safeQuestion ? ` ${question}` : ""}`;
}

/** Cheap checks catch empty/duplicate model outputs before they reach users. */
export function suggestionIssue(suggestions: { text: string }[], count: number, flag: SafetyFlag): string | undefined {
  if (flag !== "none") return;
  const lines = suggestions.map((s) => groundFillInText(s.text).trim()).filter(Boolean);
  if (lines.length < count) return `Return ${count} usable alternatives, including [fill-in] replies if a personal fact is missing. Do not return an empty list or require the user to supply facts first.`;
  const keys = lines.slice(0, count).map((s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim());
  if (new Set(keys).size !== keys.length) return "The alternatives repeat the same text. Rewrite them as distinct conversational choices while answering the same question and preserving the known facts.";
}
