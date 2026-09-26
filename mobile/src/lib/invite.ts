/** Invite message used by share cards and the Me → Invite card. */
const INVITE_URL = process.env.EXPO_PUBLIC_INVITE_URL?.trim() || undefined; // e.g. your Play Store / landing page link

export function inviteText(code?: string) {
  const base = "I've been using Rizz AI to reply on Insta & dating apps 🔥";
  const withCode = code ? `${base} Use my code ${code} for 7 days of Pro free.` : base;
  return INVITE_URL ? `${withCode} ${INVITE_URL}` : withCode;
}
