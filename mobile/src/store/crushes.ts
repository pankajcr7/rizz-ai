/**
 * Crush profiles — the app's memory of each person you're talking to.
 * Stored only on this device. Facts come from the AI ("loves hiking",
 * "dog named Bruno") plus the user's own notes, and are sent along with
 * reply requests so suggestions can call back to earlier chats.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChatMessage, Platform } from "@rizz/shared";

export interface Crush {
  id: string;
  name: string;
  platform: Platform;
  /** Index into CRUSH_COLORS for the avatar. */
  color: number;
  facts: string[];
  notes: string;
  vibe: { at: number; interest: number; ghost?: number }[];
  /** Last few messages, so you can pick the conversation back up. */
  chat: ChatMessage[];
  lastThem?: string;
  lastAt: number;
  /** Their message was last — you owe a reply. */
  waiting: boolean;
  createdAt: number;
}

export const CRUSH_COLORS = [
  ["#FF3D7F", "#FF7A59"],
  ["#8B7CFF", "#FF3D7F"],
  ["#34D399", "#3B82F6"],
  ["#FFB547", "#FF7A59"],
  ["#22D3EE", "#8B7CFF"],
] as const;

const MAX_FACTS = 20;
const uid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

interface CrushState {
  crushes: Crush[];
  activeId: string | null;
  add: (name: string, platform: Platform) => Crush;
  update: (id: string, patch: Partial<Omit<Crush, "id">>) => void;
  remove: (id: string) => void;
  setActive: (id: string | null) => void;
  /** Find by name (case-insensitive), e.g. from a screenshot header. */
  findByName: (name: string) => Crush | undefined;
  /** Record a finished reply session. */
  recordSession: (id: string, s: { chat: ChatMessage[]; interest: number; ghost?: number; memory: string[] }) => void;
  /** User sent a reply → no longer waiting on you. */
  markReplied: (id: string, text: string) => void;
  removeFact: (id: string, fact: string) => void;
}

export const useCrushes = create<CrushState>()(
  persist(
    (set, get) => ({
      crushes: [],
      activeId: null,

      add: (name, platform) => {
        const now = Date.now();
        const crush: Crush = {
          id: uid(),
          name: name.trim().slice(0, 40) || "Someone",
          platform,
          color: get().crushes.length % CRUSH_COLORS.length,
          facts: [],
          notes: "",
          vibe: [],
          chat: [],
          lastAt: now,
          waiting: false,
          createdAt: now,
        };
        set((s) => ({ crushes: [crush, ...s.crushes], activeId: crush.id }));
        return crush;
      },
      update: (id, patch) => set((s) => ({ crushes: s.crushes.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      remove: (id) => set((s) => ({ crushes: s.crushes.filter((c) => c.id !== id), activeId: s.activeId === id ? null : s.activeId })),
      setActive: (activeId) => set({ activeId }),
      findByName: (name) => {
        const n = name.trim().toLowerCase();
        return get().crushes.find((c) => c.name.toLowerCase() === n);
      },
      recordSession: (id, { chat, interest, ghost, memory }) =>
        set((s) => ({
          crushes: s.crushes.map((c) => {
            if (c.id !== id) return c;
            const known = new Set(c.facts.map((f) => f.toLowerCase()));
            const facts = [...c.facts, ...memory.filter((m) => !known.has(m.toLowerCase()))].slice(-MAX_FACTS);
            const last = chat.at(-1);
            return {
              ...c,
              facts,
              chat: chat.slice(-30),
              vibe: [...c.vibe, { at: Date.now(), interest, ghost }].slice(-20),
              lastThem: [...chat].reverse().find((m) => m.from === "them")?.text ?? c.lastThem,
              lastAt: Date.now(),
              waiting: last?.from === "them",
            };
          }),
        })),
      markReplied: (id, text) =>
        set((s) => ({
          crushes: s.crushes.map((c) => (c.id === id ? { ...c, waiting: false, lastAt: Date.now(), chat: [...c.chat, { from: "me" as const, text }].slice(-30) } : c)),
        })),
      removeFact: (id, fact) => set((s) => ({ crushes: s.crushes.map((c) => (c.id === id ? { ...c, facts: c.facts.filter((f) => f !== fact) } : c)) })),
    }),
    { name: "rizz-crushes", version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** "2d ago", "5h ago", "just now" */
export const agoPhrase = (ts: number) => {
  const a = ago(ts);
  return a === "just now" ? a : `${a} ago`;
};

/** "2d", "5h", "just now" */
export function ago(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
