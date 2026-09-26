/**
 * Speech-to-text for voice practice. Uses Groq's free Whisper endpoint
 * (OpenAI-compatible /audio/transcriptions). Optional: without a Groq key the
 * route answers 501 and the app hides voice mode.
 */
import { AiUnavailableError } from "./types.js";

export interface Transcriber {
  transcribe(audio: Buffer, mimeType: string, language?: string): Promise<string>;
}

// Whisper takes ISO-639-1 codes. Code-mixed Indian languages are best left to auto-detect.
const ISO: Record<string, string> = { english: "en", hindi: "hi", spanish: "es", portuguese: "pt", french: "fr", german: "de", arabic: "ar" };
const EXT: Record<string, string> = {
  "audio/m4a": "m4a",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

/**
 * Whisper famously "hears" these in silence or noise. For short clips (under
 * ~1s of audio) a transcript that is only one of them is treated as silence.
 */
const SILENCE_HALLUCINATIONS = new Set([
  "thank you", "thanks", "thank you very much", "thanks for watching", "thank you for watching",
  "you", "bye", "okay", "ok", "subtitles by the amara org community", "please subscribe",
]);
const SHORT_CLIP_BYTES = 12_000;

export function isLikelySilence(text: string, audioBytes: number): boolean {
  const norm = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
  return !norm || (audioBytes < SHORT_CLIP_BYTES && SILENCE_HALLUCINATIONS.has(norm));
}

export function createGroqTranscriber(opts: { apiKey: string; model?: string; fetch?: typeof fetch }): Transcriber {
  const doFetch = opts.fetch ?? fetch;
  return {
    async transcribe(audio, mimeType, language) {
      const form = new FormData();
      form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), `voice.${EXT[mimeType] ?? "m4a"}`);
      form.append("model", opts.model ?? "whisper-large-v3-turbo");
      form.append("response_format", "json");
      const iso = language ? ISO[language] : undefined;
      if (iso) form.append("language", iso);

      let res: Response;
      try {
        res = await doFetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}` },
          body: form,
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        throw new AiUnavailableError("Could not reach speech recognition", err);
      }
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        if (res.status === 429 || res.status >= 500 || res.status === 401) throw new AiUnavailableError("Voice is busy, try again", new Error(`groq stt ${res.status}: ${detail}`));
        throw new Error(`groq stt ${res.status}: ${detail}`);
      }
      const { text } = (await res.json()) as { text?: string };
      const out = (text ?? "").trim();
      return isLikelySilence(out, audio.length) ? "" : out;
    },
  };
}
