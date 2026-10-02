import { afterEach, expect, it, vi } from "vitest";
import { SuggestRequestSchema } from "@rizz/shared";
import { withCapacity } from "../src/ai/capacity.js";
import { createAIFromEnv, withFallback } from "../src/ai/providers.js";
import { AiUnavailableError, type RizzAI } from "../src/ai/types.js";

const req = SuggestRequestSchema.parse({ tone: "smooth", messages: [{ from: "them", text: "hey" }] });
const fake = (fn: (...args: unknown[]) => Promise<unknown>) => ({ suggest: fn, openers: fn, extract: fn, chat: fn, datePlan: fn, profileReview: fn }) as unknown as RizzAI;
afterEach(() => vi.useRealTimers());

it("uses configured backups automatically and lets an explicit none disable them", () => {
  expect(createAIFromEnv({ GROQ_API_KEY: "a", GEMINI_API_KEY: "b" }).description).toBe("groq (fallback: gemini)");
  expect(createAIFromEnv({ GROQ_API_KEY: "a", GEMINI_API_KEY: "b", AI_FALLBACK: "none" }).description).toBe("groq");
});
it("pauses repeated calls to a busy primary, then tries it again after cooldown", async () => {
  vi.useFakeTimers();
  const primary = vi.fn(async () => { throw new AiUnavailableError("busy"); });
  const backup = vi.fn(async () => "ok");
  const ai = withFallback(fake(primary), fake(backup));
  await ai.suggest(req, "none"); await ai.suggest(req, "none");
  expect(primary).toHaveBeenCalledTimes(1);
  expect(backup).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(30001);
  await ai.suggest(req, "none");
  expect(primary).toHaveBeenCalledTimes(2);
});
it("bounds simultaneous provider work and rejects an overflowing wait queue", async () => {
  const finish: ((result: unknown) => void)[] = [];
  const task = vi.fn(() => new Promise((resolve) => finish.push(resolve)));
  const ai = withCapacity(fake(task), 2, 1);
  const first = ai.suggest(req, "none"); const second = ai.suggest(req, "none"); const queued = ai.suggest(req, "none");
  await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(2));
  await expect(ai.suggest(req, "none")).rejects.toBeInstanceOf(AiUnavailableError);
  finish[0]!("first"); await first;
  await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(3));
  finish[1]!("second"); finish[2]!("queued"); await Promise.all([second, queued]);
});
