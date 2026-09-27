/** Events carry a JSON string; parse with the helpers in RizzOverlayModule.ts. */
export type RizzOverlayModuleEvents = {
  onCapture: (e: { json: string }) => void;
  onToneChange: (e: { json: string }) => void;
  onRegenerate: (e: { json: string }) => void;
  onBubbleStopped: (e: { json: string }) => void;
  onAction: (e: { json: string }) => void;
};

type OcrMessage = { from: "me" | "them"; text: string };
/** Best guess from bubble colours / layout. */
export type OcrPlatform = "instagram" | "whatsapp" | "snapchat" | "other";

/** What the on-device OCR read: one screen (tap), or every screen while scrolling up (long-press). */
export type CapturedChat =
  | { mode: "screen"; theirName: string | null; messages: OcrMessage[]; lineCount: number; platform: OcrPlatform }
  | { mode: "history"; frames: { messages: OcrMessage[] }[]; names: string[]; platforms: OcrPlatform[] };

/** Buttons in the panel that JS handles. */
export type PanelAction =
  | { action: "coach_open" }
  | { action: "coach_ask"; question: string }
  | { action: "show_replies" }
  | { action: "open_in_app" };

/** State rendered by the native overlay panel. */
export type PanelState =
  | { state: "loading"; title: string }
  | { state: "error"; title: string; message: string }
  | {
      state: "result";
      title: string;
      activeTone: string;
      tones: { id: string; label: string; emoji: string }[];
      suggestions: { text: string; why: string }[];
      vibe?: { interest: number; mood: string; summary: string };
      /** Whole-chat counts, e.g. "86 messages · they write 44% · ask you 7 questions". */
      stats?: string;
      safety?: { flag: string; message: string };
      coachTip?: string;
      /** Replies are based on the whole chat (hides "Read whole chat"). */
      wholeChat?: boolean;
    }
  | {
      state: "coach";
      title: string;
      intro?: string;
      turns: { role: "user" | "assistant"; content: string }[];
      chips: string[];
      thinking?: boolean;
    };
