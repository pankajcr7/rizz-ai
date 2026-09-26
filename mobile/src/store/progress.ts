/** XP, streak and weekly challenge progress (on device). Rules live in @rizz/shared/progress. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { applyEvent, INITIAL_PROGRESS, type EventMeta, type ProgressEvent, type ProgressState } from "@rizz/shared";
import { toast } from "../components/Toast";
import { useApp } from "./index";

interface ProgressStore extends ProgressState {
  award: (event: ProgressEvent, meta?: EventMeta) => void;
  reset: () => void;
}

export const useProgress = create<ProgressStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_PROGRESS,
      award: (event, meta = {}) => {
        const { xp, streak, week } = get();
        // Replies carry the user's language/goal so language/goal challenges can count them.
        const app = useApp.getState();
        const full: EventMeta = { language: app.prefs.language, goal: app.goal, ...meta };
        const r = applyEvent({ xp, streak, week }, event, full);
        set(r.state);
        // Celebrate only the moments that matter — no toast spam on every action.
        if (r.levelUp) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          toast(`Level up! ${r.levelUp.emoji} ${r.levelUp.title}`, "trophy");
        } else if (r.completed.length) {
          const c = r.completed[0]!;
          toast(`${c.emoji} Challenge done · +${c.reward} XP`, "trophy");
        } else if (r.streakUp && r.state.streak.count > 1) {
          toast(`🔥 ${r.state.streak.count}-day streak`, "flame");
        }
      },
      reset: () => set(INITIAL_PROGRESS),
    }),
    {
      name: "rizz-progress",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ xp, streak, week }) => ({ xp, streak, week }),
    },
  ),
);
