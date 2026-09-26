/**
 * Voice practice helpers: record → base64 → /v1/transcribe, and speak replies.
 * Recording: expo-audio (m4a on phones, webm in the browser).
 * Speaking: expo-speech (on-device text-to-speech, free).
 */
import { File } from "expo-file-system";
import * as Speech from "expo-speech";
import { Platform } from "react-native";
import type { Preferences, TranscribeRequest } from "@rizz/shared";

export const recordingMime: TranscribeRequest["mimeType"] = Platform.OS === "web" ? "audio/webm" : "audio/m4a";

export async function readBase64(uri: string): Promise<string> {
  if (Platform.OS !== "web") return new File(uri).base64();
  const blob = await (await fetch(uri)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// Voices for code-mixed languages: an Indian English / Hindi voice reads romanized text most naturally.
const VOICE_LANG: Partial<Record<Preferences["language"], string>> = {
  english: "en-US",
  hinglish: "en-IN",
  hindi: "hi-IN",
  tanglish: "en-IN",
  tenglish: "en-IN",
  benglish: "en-IN",
  manglish: "en-IN",
  kanglish: "en-IN",
  punglish: "en-IN",
  spanish: "es-ES",
  portuguese: "pt-BR",
  french: "fr-FR",
  german: "de-DE",
  arabic: "ar-SA",
};

/** Speak a reply out loud; emojis are stripped so the voice doesn't read them. */
export function speak(text: string, language: Preferences["language"]) {
  const clean = text.replace(/\p{Extended_Pictographic}|️/gu, "").trim();
  if (!clean) return;
  void Speech.stop();
  Speech.speak(clean, { language: VOICE_LANG[language], rate: 1.02, pitch: 1.05 });
}

export const stopSpeaking = () => void Speech.stop();
