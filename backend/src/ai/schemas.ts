import { z } from "zod";

// Model-facing schemas. Structured outputs support a subset of JSON Schema, so
// these avoid numeric/length constraints; results are clamped in normalize*().
const Suggestion = z.object({ text: z.string(), why: z.string() });
const Safety = z.object({
  flag: z.enum(["none", "not_interested", "uncomfortable", "possible_minor", "user_harassing"]),
  message: z.string(),
});
export const SuggestOut = z.object({
  suggestions: z.array(Suggestion),
  vibe: z.object({
    interest: z.number().describe("How interested the other person seems, as an integer from 0 (not at all) to 100 (very)"),
    mood: z.enum(["excited", "flirty", "friendly", "neutral", "dry", "annoyed", "uncomfortable"]),
    summary: z.string(),
    signals: z.array(z.string()),
    ghost: z
      .object({
        risk: z.number().describe("0-100: how likely they are to stop replying soon"),
        reason: z.string(),
        fix: z.string(),
      })
      .optional(),
  }),
  safety: Safety,
  coachTip: z.string(),
  memory: z
    .array(z.string())
    .describe("Up to 5 NEW short lasting facts about THEM from this chat (interests, plans, pets' names, inside jokes). Never health, religion, sexuality, address, phone, workplace. Empty if nothing new.")
    // Optional so a model that forgets this field doesn't fail the whole request.
    .optional(),
  nextMove: z.object({ action: z.enum(["reply", "wait", "end"]), reason: z.string() }).optional(),
  missingInfo: z.object({ prompt: z.string() }).optional(),
});
export const OpenersOut = z.object({ openers: z.array(Suggestion), hooks: z.array(z.string()), safety: Safety });
export const ChatOut = z.object({
  reply: z.string(),
  feedback: z.object({ score: z.number(), note: z.string(), better: z.string() }).nullable(),
  safety: Safety,
});
export const ExtractOut = z.object({
  platform: z.enum(["instagram", "snapchat", "tinder", "bumble", "hinge", "facebook", "whatsapp", "telegram", "other"]),
  theirName: z.string().nullable(),
  messages: z.array(z.object({ from: z.enum(["me", "them"]), text: z.string() })),
});

export const ProfileOut = z.object({
  score: z.number().describe("Overall profile score from 1 to 10 (can use one decimal)"),
  firstImpression: z.string(),
  photos: z.array(z.object({ index: z.number().describe("1-based photo number"), score: z.number().describe("1 to 10"), verdict: z.string(), tip: z.string() })),
  bio: z.object({ score: z.number().describe("1 to 10"), feedback: z.string(), rewrites: z.array(z.string()) }).nullable(),
  strengths: z.array(z.string()),
  fixes: z.array(z.string()),
  roast: z.string().nullable(),
  safety: Safety,
});

export const DateOut = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      emoji: z.string(),
      why: z.string(),
      where: z.string().describe("A kind of place, e.g. 'a rooftop café' — never an invented business name"),
      cost: z.string(),
      ask: z.string().describe("Ready-to-send message asking them out for this date"),
    }),
  ),
  tip: z.string(),
  safety: Safety,
});
