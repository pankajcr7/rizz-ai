/**
 * Provider-independent pieces of Chat mode: turn preparation and output
 * normalisation. Every AI provider uses these so behaviour stays identical.
 */
import type { ChatRequestParsed, ChatResponse, ChatTurn, SafetyFlag } from "@rizz/shared";
import { redact } from "../safety/redact.js";
import { SAFETY_MESSAGES } from "../safety/guardrails.js";
import { buildChatContext } from "./prompts.js";
import { mergeFlag } from "./safetyFlags.js";

/**
 * Redact, merge consecutive same-role turns, make sure the conversation
 * starts with the user, and prepend the settings block to the first turn.
 */
export function prepareTurns(req: ChatRequestParsed): ChatTurn[] {
  const merged: ChatTurn[] = [];
  for (const t of req.turns) {
    const content = redact(t.content);
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.content += `\n${content}`;
    else merged.push({ role: t.role, content });
  }
  const context = buildChatContext(req);
  if (merged[0]?.role === "user") merged[0].content = `${context}\n\n${merged[0].content}`;
  else merged.unshift({ role: "user", content: context });
  return merged;
}

export interface RawChatOut {
  reply: string;
  feedback: { score: number; note: string; better: string } | null;
  safety: { flag: SafetyFlag; message: string };
}

export function normalizeChat(out: RawChatOut, req: ChatRequestParsed, forcedFlag: SafetyFlag): ChatResponse {
  const flag = mergeFlag(forcedFlag, out.safety.flag);
  const message = out.safety.message || SAFETY_MESSAGES[flag];
  if (flag === "possible_minor") {
    return { reply: SAFETY_MESSAGES.possible_minor, feedback: null, safety: { flag, message } };
  }
  const feedback =
    req.mode === "practice" && out.feedback
      ? { ...out.feedback, score: Math.max(1, Math.min(10, Math.round(out.feedback.score))) }
      : null;
  return { reply: out.reply.trim(), feedback, safety: { flag, message: flag === "none" ? "" : message } };
}
