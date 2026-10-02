import { AiUnavailableError, type RizzAI } from "./types.js";

/** Bound simultaneous provider work and waiting requests on each server. */
export function withCapacity(ai: RizzAI, maxActive = 2, maxWaiting = 12, waitMs = 8000): RizzAI {
  let active = 0;
  const waiting: (() => void)[] = [];
  async function slot() {
    if (active < maxActive) { active++; return; }
    if (waiting.length >= maxWaiting) throw new AiUnavailableError("AI is busy. Please try again shortly.");
    await new Promise<void>((resolve, reject) => {
      const ready = () => { clearTimeout(timer); resolve(); };
      const timer = setTimeout(() => {
        const index = waiting.indexOf(ready);
        if (index >= 0) waiting.splice(index, 1);
        reject(new AiUnavailableError("AI is busy. Please try again shortly."));
      }, waitMs);
      waiting.push(ready);
    });
  }
  const wrap = <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => async (...args: A): Promise<R> => {
    await slot();
    try { return await fn(...args); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  };
  return {
    suggest: wrap(ai.suggest.bind(ai)), openers: wrap(ai.openers.bind(ai)), extract: wrap(ai.extract.bind(ai)),
    chat: wrap(ai.chat.bind(ai)), profileReview: wrap(ai.profileReview.bind(ai)), datePlan: wrap(ai.datePlan.bind(ai)),
  };
}
