import { create } from "zustand";

/** What a share card shows. Built from results; rendered by ShareCard. */
export type CardData =
  | { kind: "vibe"; interest: number; verdict: string; line: string; theirName?: string }
  | { kind: "practice"; avg: number; messages: number; persona: string; best?: string }
  | { kind: "profile"; score: number; firstImpression: string; topFix?: string };

export const useShare = create<{ card: CardData | null; open: (c: CardData) => void }>((set) => ({
  card: null,
  open: (card) => set({ card }),
}));
