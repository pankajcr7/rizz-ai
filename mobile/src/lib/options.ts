import { TONES, type Goal, type Platform, type ToneId } from "@rizz/shared";

export const TONE_OPTIONS = (Object.keys(TONES) as ToneId[]).map((id) => ({
  id,
  label: `${TONES[id].emoji} ${TONES[id].label}`,
}));

/** Shorter list for the live overlay panel. */
export const LIVE_TONES: ToneId[] = ["smooth", "flirty", "funny", "witty", "sweet", "confident", "chill", "deep"];

export const GOAL_OPTIONS: { id: Goal; label: string }[] = [
  { id: "keep_going", label: "💬 Keep it going" },
  { id: "flirt_more", label: "😏 Flirt more" },
  { id: "ask_out", label: "📅 Ask them out" },
  { id: "get_number", label: "📱 Get their number" },
  { id: "revive", label: "🧟 Revive a dead chat" },
  { id: "recover", label: "🩹 Fix a fail" },
];

export const PLATFORM_OPTIONS: { id: Platform; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "tinder", label: "Tinder" },
  { id: "snapchat", label: "Snapchat" },
  { id: "hinge", label: "Hinge" },
  { id: "bumble", label: "Bumble" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "facebook", label: "Messenger" },
  { id: "telegram", label: "Telegram" },
  { id: "other", label: "Other" },
];
