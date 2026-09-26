/**
 * Connects the native live-mode bubble (Android) to the backend:
 * bubble tap → on-device OCR → onCapture → /v1/suggest → native panel.
 * Tone chips and "New ideas" in the panel re-run with the last capture.
 */
import { TONES, type ToneId } from "@rizz/shared";
import { RizzOverlay, type CapturedChat } from "../../modules/rizz-overlay";
import { api, RizzApiError } from "../api/client";
import { useApp } from "../store";
import { LIVE_TONES } from "./options";

let lastChat: CapturedChat | null = null;
let currentTone: ToneId | null = null;
let requestSeq = 0;

const tonesForPanel = () => LIVE_TONES.map((id) => ({ id, label: TONES[id].label, emoji: TONES[id].emoji }));

async function run(tone: ToneId) {
  if (!lastChat) return;
  const seq = ++requestSeq; // ignore stale responses if the user taps another tone
  currentTone = tone;
  const { prefs, addHistory, setQuota } = useApp.getState();
  const messages = lastChat.messages.filter((m) => m.text.trim()).slice(-40);

  try {
    const result = await api.suggest({
      platform: "other",
      messages,
      tone,
      theirName: lastChat.theirName ?? undefined,
      prefs,
    });
    if (seq !== requestSeq) return;
    RizzOverlay.showPanel({
      state: "result",
      title: lastChat.theirName ? `Replies for ${lastChat.theirName} ✨` : "Rizz AI ✨",
      activeTone: tone,
      tones: tonesForPanel(),
      suggestions: result.suggestions,
      vibe: result.vibe,
      safety: result.safety,
      coachTip: result.coachTip,
    });
    addHistory({
      source: "live",
      platform: "other",
      theirName: lastChat.theirName ?? undefined,
      tone,
      lastMessage: messages.filter((m) => m.from === "them").at(-1)?.text,
      suggestions: result.suggestions,
      vibe: result.vibe,
    });
    api.me().then((r) => setQuota(r.quota)).catch(() => {});
  } catch (e) {
    if (seq !== requestSeq) return;
    const title =
      e instanceof RizzApiError && e.code === "quota_exceeded"
        ? "Daily free limit reached"
        : e instanceof RizzApiError && e.code === "blocked_minor"
          ? "Can't help with this chat"
          : "Couldn't get replies";
    const message =
      e instanceof RizzApiError && e.code === "quota_exceeded"
        ? "Open Rizz AI to go Pro for unlimited replies."
        : e instanceof Error
          ? e.message
          : "Try again.";
    RizzOverlay.showPanel({ state: "error", title, message });
  }
}

/** Call once at app start. Returns an unsubscribe function. */
export function startLiveBridge(): () => void {
  if (!RizzOverlay.available) return () => {};
  const subs = [
    RizzOverlay.onCapture((chat) => {
      lastChat = chat;
      void run(useApp.getState().defaultTone);
    }),
    RizzOverlay.onToneChange((tone) => {
      if (tone in TONES) void run(tone as ToneId);
    }),
    RizzOverlay.onRegenerate(() => {
      void run(currentTone ?? useApp.getState().defaultTone);
    }),
    RizzOverlay.onStopped(() => {
      lastChat = null;
    }),
  ];
  return () => subs.forEach((s) => s?.remove());
}
