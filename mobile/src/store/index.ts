/**
 * App state. Everything here lives only on the device (AsyncStorage) —
 * chat history never syncs to our servers.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { api } from "../api/client";
import type { ChatMessage, ChatResponse, Goal, PersonaId, Platform, Preferences, QuotaInfo, ReferralInfo, SuggestResponse, ToneId } from "@rizz/shared";

export type ChatMode = "coach" | "practice";
export interface ChatItem {
  role: "user" | "assistant";
  content: string;
  /** Practice mode: how this user message landed. */
  feedback?: NonNullable<ChatResponse["feedback"]>;
}

export interface Favorite {
  id: string;
  text: string;
  tone: ToneId;
  savedAt: number;
}

export interface HistoryItem {
  id: string;
  at: number;
  source: "app" | "live" | "opener";
  platform: Platform;
  theirName?: string;
  tone: ToneId;
  lastMessage?: string;
  suggestions: { text: string; why: string }[];
  vibe?: SuggestResponse["vibe"];
}

interface State {
  onboarded: boolean;
  defaultTone: ToneId;
  prefs: Preferences;
  saveHistory: boolean;
  favorites: Favorite[];
  history: HistoryItem[];
  quota: QuotaInfo | null;
  referral: ReferralInfo | null;
  /** Server capabilities (e.g. whether voice transcription is configured). */
  features: { voice: boolean };
  /** Last city used in the date planner. */
  city: string;
  /** Draft chat on the Reply screen, so switching tabs doesn't lose it. */
  draftChat: ChatMessage[];
  chats: Record<ChatMode, ChatItem[]>;
  persona: PersonaId;
  chatMode: ChatMode;
  /** Last-used vibe settings, so the Reply screen starts where you left off. */
  goal: Goal;
  platform: Platform;
  theirName?: string;

  finishOnboarding: (p: { aboutMe?: string; defaultTone: ToneId }) => void;
  setPrefs: (p: Partial<Preferences>) => void;
  setDefaultTone: (t: ToneId) => void;
  setSaveHistory: (v: boolean) => void;
  toggleFavorite: (text: string, tone: ToneId) => void;
  addHistory: (h: Omit<HistoryItem, "id" | "at">) => void;
  clearHistory: () => void;
  removeHistory: (id: string) => void;
  setQuota: (q: QuotaInfo | null) => void;
  setReferral: (r: ReferralInfo | null) => void;
  setCity: (c: string) => void;
  /** Fetch plan + referral info from the server. */
  refreshMe: () => Promise<void>;
  setDraftChat: (m: ChatMessage[]) => void;
  setChat: (mode: ChatMode, items: ChatItem[]) => void;
  setPersona: (p: PersonaId) => void;
  setChatMode: (m: ChatMode) => void;
  setGoal: (g: Goal) => void;
  setPlatform: (p: Platform) => void;
  setDraftMeta: (m: { theirName?: string; platform?: Platform }) => void;
  resetAll: () => void;
}

const initial = {
  onboarded: false,
  defaultTone: "smooth" as ToneId,
  prefs: { length: "short", emoji: 1, language: "auto", boldness: 3 } as Preferences,
  saveHistory: true,
  favorites: [] as Favorite[],
  history: [] as HistoryItem[],
  quota: null,
  referral: null as ReferralInfo | null,
  features: { voice: false },
  city: "",
  draftChat: [] as ChatMessage[],
  chats: { coach: [], practice: [] } as Record<ChatMode, ChatItem[]>,
  persona: "friendly" as PersonaId,
  chatMode: "coach" as ChatMode,
  goal: "keep_going" as Goal,
  platform: "instagram" as Platform,
  theirName: undefined as string | undefined,
};

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const useApp = create<State>()(
  persist(
    (set, get) => ({
      ...initial,
      finishOnboarding: ({ aboutMe, defaultTone }) =>
        set((s) => ({ onboarded: true, defaultTone, prefs: { ...s.prefs, aboutMe: aboutMe || undefined } })),
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
      setDefaultTone: (defaultTone) => set({ defaultTone }),
      setSaveHistory: (saveHistory) => set(saveHistory ? { saveHistory } : { saveHistory, history: [] }),
      toggleFavorite: (text, tone) =>
        set((s) =>
          s.favorites.some((f) => f.text === text)
            ? { favorites: s.favorites.filter((f) => f.text !== text) }
            : { favorites: [{ id: uid(), text, tone, savedAt: Date.now() }, ...s.favorites].slice(0, 200) },
        ),
      addHistory: (h) => {
        if (!get().saveHistory) return;
        set((s) => ({ history: [{ ...h, id: uid(), at: Date.now() }, ...s.history].slice(0, 50) }));
      },
      clearHistory: () => set({ history: [] }),
      removeHistory: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),
      setQuota: (quota) => set({ quota }),
      setReferral: (referral) => set({ referral }),
      setCity: (city) => set({ city }),
      refreshMe: async () => {
        try {
          const r = await api.me();
          set({ quota: r.quota, referral: r.referral, features: r.features ?? { voice: false } });
        } catch {
          // offline — keep what we have
        }
      },
      setDraftChat: (draftChat) => set({ draftChat }),
      // Keep the last 60 items per mode; the API only needs the recent context.
      setChat: (mode, items) => set((s) => ({ chats: { ...s.chats, [mode]: items.slice(-60) } })),
      setPersona: (persona) => set({ persona }),
      setChatMode: (chatMode) => set({ chatMode }),
      setGoal: (goal) => set({ goal }),
      setPlatform: (platform) => set({ platform }),
      setDraftMeta: ({ theirName, platform }) => set((s) => ({ theirName, platform: platform ?? s.platform })),
      resetAll: () => set({ ...initial }),
    }),
    {
      name: "rizz-app",
      version: 3,
      // Fill in fields added after v1 for existing installs (v2: chat mode, v3: boldness + vibe memory).
      migrate: (persisted) => {
        const state = persisted as Partial<State>;
        return { ...initial, ...state, prefs: { ...initial.prefs, ...state.prefs } } as State;
      },
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ quota: _q, referral: _r, features: _f, ...rest }) => rest,
    },
  ),
);

export const isFavorite = (text: string) => useApp.getState().favorites.some((f) => f.text === text);
