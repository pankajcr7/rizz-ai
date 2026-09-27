/**
 * API contract shared by the mobile app and the backend.
 * Every request body is validated with these schemas on the server; the app
 * imports the inferred types so both sides can never drift apart.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Tones
// ---------------------------------------------------------------------------

export const TONES = {
  flirty: { label: "Flirty", emoji: "😏", brief: "Playful tension, light teasing, clearly interested without being crude." },
  funny: { label: "Funny", emoji: "😂", brief: "Makes them laugh. Wordplay, absurd callbacks, self-aware humor." },
  smooth: { label: "Smooth", emoji: "😎", brief: "Effortless and confident. Short, clever, never tries too hard." },
  witty: { label: "Witty", emoji: "🧠", brief: "Quick, clever comebacks and banter. Light sarcasm, never mean." },
  sweet: { label: "Sweet", emoji: "🥰", brief: "Warm, genuine and a little romantic. Makes them feel noticed." },
  chill: { label: "Chill", emoji: "🌊", brief: "Relaxed, low-pressure, casual texting energy." },
  confident: { label: "Confident", emoji: "🔥", brief: "Direct, self-assured, leads the conversation and suggests plans." },
  mysterious: { label: "Mysterious", emoji: "🌙", brief: "Intriguing, leaves them curious, reveals a little at a time." },
  deep: { label: "Deep", emoji: "💭", brief: "Thoughtful questions and real conversation beyond small talk." },
  romantic: { label: "Romantic", emoji: "🌹", brief: "Heartfelt and poetic without being cheesy or intense." },
  playful: { label: "Playful", emoji: "🎲", brief: "Games, hypotheticals, 'would you rather', fun challenges." },
  gentleman: { label: "Respectful", emoji: "🎩", brief: "Polite, kind and classy. Great for first messages and apps like Hinge." },
  apology: { label: "Recover", emoji: "🩹", brief: "Owns a mistake or awkward moment with humor and sincerity." },
} as const;

export type ToneId = keyof typeof TONES;
export const ToneIdSchema = z.enum(Object.keys(TONES) as [ToneId, ...ToneId[]]);

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export const PlatformSchema = z.enum([
  "instagram", "snapchat", "tinder", "bumble", "hinge", "facebook", "whatsapp", "telegram", "other",
]);
export type Platform = z.infer<typeof PlatformSchema>;

export const ChatMessageSchema = z.object({
  from: z.enum(["me", "them"]),
  text: z.string().trim().min(1).max(1000),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const GoalSchema = z.enum([
  "keep_going", // keep the conversation flowing
  "ask_out", // move toward a date
  "get_number", // move off the dating app
  "flirt_more", // escalate the vibe (still respectful)
  "revive", // dead / ghosted chat
  "recover", // fix an awkward or bad message
]);
export type Goal = z.infer<typeof GoalSchema>;

export const LanguageSchema = z.enum([
  "auto",
  "english",
  "hinglish",
  "hindi",
  // Romanized Indian code-mix — how people actually text in each state
  "tanglish", // Tamil + English
  "tenglish", // Telugu + English
  "benglish", // Bengali + English
  "manglish", // Malayalam + English
  "kanglish", // Kannada + English
  "punglish", // Punjabi + English
  "spanish",
  "portuguese",
  "french",
  "german",
  "arabic",
]);

export const PreferencesSchema = z.object({
  length: z.enum(["short", "medium", "long"]).default("short"),
  emoji: z.number().int().min(0).max(2).default(1), // 0 none, 1 some, 2 lots
  language: LanguageSchema.default("auto"),
  /** 1 = safe & polite … 5 = bold & direct (always respectful). */
  boldness: z.number().int().min(1).max(5).default(3),
  /** A few words about the user so replies sound like them ("21, gym, loves anime"). */
  aboutMe: z.string().trim().max(300).optional(),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

// ---------------------------------------------------------------------------
// POST /v1/suggest — reply suggestions for an ongoing chat
// ---------------------------------------------------------------------------

export const SuggestRequestSchema = z.object({
  platform: PlatformSchema.default("other"),
  /** May be empty only when a draft is given ("just polish what I wrote"). */
  messages: z.array(ChatMessageSchema).max(60),
  /** Older history read in live "whole chat" mode, before `messages`. Context only; trimmed server-side. */
  earlier: z.array(ChatMessageSchema).max(300).optional(),
  tone: ToneIdSchema,
  goal: GoalSchema.default("keep_going"),
  theirName: z.string().trim().max(60).optional(),
  /** Free-form context: "we matched yesterday, she likes hiking". */
  notes: z.string().trim().max(500).optional(),
  /** What the app remembers about this person from earlier chats (crush profile). */
  memory: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  /** "Improve my message" mode: the user's own draft to polish. */
  draft: z.string().trim().max(1000).optional(),
  count: z.number().int().min(1).max(5).default(3),
  prefs: PreferencesSchema.default({ length: "short", emoji: 1, language: "auto", boldness: 3 }),
}).refine((r) => r.messages.length > 0 || !!r.draft, { message: "Add the chat, or a draft to improve", path: ["messages"] });
export type SuggestRequest = z.input<typeof SuggestRequestSchema>;
export type SuggestRequestParsed = z.output<typeof SuggestRequestSchema>;

export const SuggestionSchema = z.object({
  text: z.string(),
  /** One short line on why this works — the in-app "coach". */
  why: z.string(),
});

export const VibeSchema = z.object({
  /** 0-100 estimate of how engaged the other person seems. */
  interest: z.number().int().min(0).max(100),
  mood: z.enum(["excited", "flirty", "friendly", "neutral", "dry", "annoyed", "uncomfortable"]),
  summary: z.string(),
  /** Concrete observations: "asks you questions back", "one-word replies". */
  signals: z.array(z.string()).max(5),
  /** How likely they are to stop replying, why, and how to re-hook them. */
  ghost: z.object({ risk: z.number().int().min(0).max(100), reason: z.string(), fix: z.string() }).optional(),
});

export const SafetyFlagSchema = z.enum([
  "none",
  "not_interested", // they said no / stop / not interested
  "uncomfortable", // they seem uneasy
  "possible_minor", // signs the other person is under 18
  "user_harassing", // the user's own messages are aggressive or pushy
]);
export type SafetyFlag = z.infer<typeof SafetyFlagSchema>;

export const SuggestResponseSchema = z.object({
  suggestions: z.array(SuggestionSchema),
  vibe: VibeSchema,
  safety: z.object({ flag: SafetyFlagSchema, message: z.string() }),
  /** A single coaching tip about the conversation as a whole. */
  coachTip: z.string(),
  /** New lasting facts about THEM learned from this chat, for their crush profile. */
  memory: z.array(z.string()),
});
export type SuggestResponse = z.infer<typeof SuggestResponseSchema>;

// ---------------------------------------------------------------------------
// POST /v1/openers — first messages from a profile (bio text and/or screenshot)
// ---------------------------------------------------------------------------

export const ImageSchema = z.object({
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  /** Base64 without the data: prefix. ~5 MB cap after encoding. */
  data: z.string().min(100).max(7_000_000),
});
export type ImageInput = z.infer<typeof ImageSchema>;

export const OpenersRequestSchema = z
  .object({
    platform: PlatformSchema.default("other"),
    tone: ToneIdSchema,
    bio: z.string().trim().max(2000).optional(),
    image: ImageSchema.optional(),
    count: z.number().int().min(1).max(5).default(3),
    prefs: PreferencesSchema.default({ length: "short", emoji: 1, language: "auto", boldness: 3 }),
  })
  .refine((r) => r.bio || r.image, { message: "Provide a bio or a profile screenshot" });
export type OpenersRequest = z.input<typeof OpenersRequestSchema>;

export const OpenersResponseSchema = z.object({
  openers: z.array(SuggestionSchema),
  /** Things the AI noticed on the profile that openers can hook into. */
  hooks: z.array(z.string()).max(6),
  safety: z.object({ flag: SafetyFlagSchema, message: z.string() }),
});
export type OpenersResponse = z.infer<typeof OpenersResponseSchema>;

// ---------------------------------------------------------------------------
// POST /v1/extract — turn a chat screenshot into structured messages
// (used on iOS and for gallery uploads; Android live mode does OCR on-device)
// ---------------------------------------------------------------------------

export const ExtractRequestSchema = z.object({
  image: ImageSchema,
  platformHint: PlatformSchema.optional(),
});
export type ExtractRequest = z.input<typeof ExtractRequestSchema>;

export const ExtractResponseSchema = z.object({
  platform: PlatformSchema,
  theirName: z.string().nullable(),
  messages: z.array(z.object({ from: z.enum(["me", "them"]), text: z.string() })),
});
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

// ---------------------------------------------------------------------------
// POST /v1/chat — Chat mode
//   coach:    talk to the AI wingman about your situation
//   practice: the AI plays a match so you can practise texting, with feedback
// ---------------------------------------------------------------------------

export const PRACTICE_PERSONAS = {
  friendly: { label: "Friendly", emoji: "😊", brief: "warm, chatty, easy to talk to" },
  shy: { label: "Shy", emoji: "🙈", brief: "a bit reserved, short replies at first, opens up if the user is genuine" },
  sarcastic: { label: "Sarcastic", emoji: "🙄", brief: "dry humour, teases back, hates boring openers" },
  busy: { label: "Busy", emoji: "⏳", brief: "replies late and short; the user has to be interesting to hold attention" },
  flirty: { label: "Flirty", emoji: "😏", brief: "playful and flirty back when the user is confident and respectful" },
} as const;
export type PersonaId = keyof typeof PRACTICE_PERSONAS;
export const PersonaIdSchema = z.enum(Object.keys(PRACTICE_PERSONAS) as [PersonaId, ...PersonaId[]]);

export const ChatTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});
export type ChatTurn = z.infer<typeof ChatTurnSchema>;

export const ChatRequestSchema = z
  .object({
    mode: z.enum(["coach", "practice"]).default("coach"),
    persona: PersonaIdSchema.default("friendly"),
    turns: z.array(ChatTurnSchema).min(1).max(40),
    /** Coach mode: the chat the user is asking about (e.g. read live from Instagram). */
    context: z
      .object({
        platform: PlatformSchema.default("other"),
        theirName: z.string().trim().max(60).optional(),
        messages: z.array(ChatMessageSchema).min(1).max(360),
      })
      .optional(),
    prefs: PreferencesSchema.default({ length: "short", emoji: 1, language: "auto", boldness: 3 }),
  })
  .refine((r) => r.turns[r.turns.length - 1]?.role === "user", { message: "The last turn must be from the user" });
export type ChatRequest = z.input<typeof ChatRequestSchema>;
export type ChatRequestParsed = z.output<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  reply: z.string(),
  /** Practice mode: how the user's last message landed. Null in coach mode. */
  feedback: z.object({ score: z.number().int().min(1).max(10), note: z.string(), better: z.string() }).nullable(),
  safety: z.object({ flag: SafetyFlagSchema, message: z.string() }),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

// ---------------------------------------------------------------------------
// POST /v1/profile-review — score the user's OWN dating profile
// ---------------------------------------------------------------------------

export const ProfileReviewRequestSchema = z
  .object({
    platform: PlatformSchema.default("tinder"),
    /** Up to 3 photos / screenshots of the user's own profile. */
    images: z.array(ImageSchema).max(3).default([]),
    bio: z.string().trim().max(2000).optional(),
    /** Include a playful roast section. */
    roast: z.boolean().default(false),
    prefs: PreferencesSchema.default({ length: "short", emoji: 1, language: "auto", boldness: 3 }),
  })
  .refine((r) => r.images.length > 0 || r.bio, { message: "Add at least one photo or your bio" });
export type ProfileReviewRequest = z.input<typeof ProfileReviewRequestSchema>;
export type ProfileReviewRequestParsed = z.output<typeof ProfileReviewRequestSchema>;

export const ProfileReviewResponseSchema = z.object({
  /** Overall 1-10. */
  score: z.number(),
  firstImpression: z.string(),
  photos: z.array(z.object({ index: z.number().int(), score: z.number(), verdict: z.string(), tip: z.string() })),
  bio: z.object({ score: z.number(), feedback: z.string(), rewrites: z.array(z.string()) }).nullable(),
  strengths: z.array(z.string()),
  fixes: z.array(z.string()),
  roast: z.string().nullable(),
  safety: z.object({ flag: SafetyFlagSchema, message: z.string() }),
});
export type ProfileReviewResponse = z.infer<typeof ProfileReviewResponseSchema>;

// ---------------------------------------------------------------------------
// POST /v1/date-plan — date ideas + the exact message to ask them out
// ---------------------------------------------------------------------------

export const DatePlanRequestSchema = z.object({
  theirName: z.string().trim().max(60).optional(),
  city: z.string().trim().max(80).optional(),
  budget: z.enum(["low", "mid", "high"]).default("mid"),
  vibe: z.enum(["chill", "fun", "romantic", "adventurous"]).default("fun"),
  /** Recent chat, for context and callbacks. */
  messages: z.array(ChatMessageSchema).max(30).default([]),
  memory: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  prefs: PreferencesSchema.default({ length: "short", emoji: 1, language: "auto", boldness: 3 }),
});
export type DatePlanRequest = z.input<typeof DatePlanRequestSchema>;
export type DatePlanRequestParsed = z.output<typeof DatePlanRequestSchema>;

export const DatePlanResponseSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      emoji: z.string(),
      why: z.string(),
      /** A kind of place ("rooftop café"), not an invented business name. */
      where: z.string(),
      cost: z.string(),
      /** Ready-to-send message asking them out for this date. */
      ask: z.string(),
    }),
  ),
  tip: z.string(),
  safety: z.object({ flag: SafetyFlagSchema, message: z.string() }),
});
export type DatePlanResponse = z.infer<typeof DatePlanResponseSchema>;

// ---------------------------------------------------------------------------
// POST /v1/transcribe — voice practice (speech → text)
// ---------------------------------------------------------------------------

export const TranscribeRequestSchema = z.object({
  mimeType: z.enum(["audio/m4a", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/webm", "audio/ogg", "audio/mpeg", "audio/wav"]),
  /** Base64 audio, no data: prefix. ~4 MB cap (about a minute). */
  data: z.string().min(100).max(5_500_000),
  language: LanguageSchema.optional(),
});
export type TranscribeRequest = z.input<typeof TranscribeRequestSchema>;

// ---------------------------------------------------------------------------
// Referrals — invite a friend, you both get Pro days
// ---------------------------------------------------------------------------

export const REFERRAL_REWARD_DAYS = 7;
export const RedeemRequestSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, "Codes are 6 letters/numbers") });

export interface ReferralInfo {
  code: string;
  /** Friends who used your code. */
  invites: number;
  /** Whether this device already redeemed someone's code. */
  redeemed: boolean;
  /** ISO time Pro (from referrals) lasts until, if any. */
  proUntil: string | null;
}

// ---------------------------------------------------------------------------
// Errors & quota
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "quota_exceeded"
  | "blocked_minor"
  | "ai_declined"
  | "ai_unavailable"
  | "not_supported"
  | "internal";

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}

export interface QuotaInfo {
  plan: "free" | "pro";
  used: number;
  limit: number | null;
  resetsAt: string;
}
