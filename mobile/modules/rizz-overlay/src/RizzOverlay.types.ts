/** Events carry a JSON string; parse with the helpers in RizzOverlayModule.ts. */
export type RizzOverlayModuleEvents = {
  onCapture: (e: { json: string }) => void;
  onToneChange: (e: { json: string }) => void;
  onRegenerate: (e: { json: string }) => void;
  onBubbleStopped: (e: { json: string }) => void;
};

/** What the on-device OCR read off the screen. */
export type CapturedChat = {
  theirName: string | null;
  messages: { from: "me" | "them"; text: string }[];
  lineCount: number;
};

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
      safety?: { flag: string; message: string };
      coachTip?: string;
    };
