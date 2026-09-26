/**
 * Keeps the Android Rizz Keyboard's settings (API URL, session token, tone,
 * language, boldness) in sync with the app, since the keyboard runs as a
 * separate Android service and calls the backend itself.
 */
import { RizzOverlay } from "../../modules/rizz-overlay";
import { API_URL, getSessionToken } from "../api/client";
import { useApp } from "../store";

async function push() {
  if (!RizzOverlay.available) return;
  try {
    const token = await getSessionToken();
    const { defaultTone, prefs } = useApp.getState();
    RizzOverlay.keyboard.setConfig({ apiUrl: API_URL, token, tone: defaultTone, language: prefs.language, boldness: prefs.boldness });
  } catch {
    // offline on first launch — we'll retry on the next settings change / app start
  }
}

/** Call once at startup; re-syncs whenever tone or preferences change. */
export function startKeyboardSync(): () => void {
  if (!RizzOverlay.available) return () => {};
  void push();
  return useApp.subscribe((s, prev) => {
    if (s.defaultTone !== prev.defaultTone || s.prefs !== prev.prefs) void push();
  });
}
