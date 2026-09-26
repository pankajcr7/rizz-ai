/**
 * The current generation job (replies or openers) shown on the Results
 * screen. Not persisted. Re-running with another tone keeps everything else.
 */
import * as Haptics from "expo-haptics";
import { create } from "zustand";
import type { OpenersRequest, OpenersResponse, ProfileReviewRequest, ProfileReviewResponse, SuggestRequest, SuggestResponse, ToneId } from "@rizz/shared";
import { api, errorMessage, RizzApiError } from "../api/client";
import { scheduleCrushNudge } from "../lib/nudges";
import { useCrushes } from "./crushes";
import { useApp } from "./index";
import { useProgress } from "./progress";

export type Job =
  | { kind: "reply"; req: SuggestRequest; crushId?: string }
  | { kind: "opener"; req: OpenersRequest }
  | { kind: "profile"; req: ProfileReviewRequest };

interface SessionState {
  job: Job | null;
  status: "idle" | "loading" | "done" | "error";
  reply?: SuggestResponse;
  opener?: OpenersResponse;
  profile?: ProfileReviewResponse;
  error?: { message: string; quota: boolean };
  run: (job: Job) => Promise<void>;
  retone: (tone: ToneId) => Promise<void>;
  more: () => Promise<void>;
}

let seq = 0;

export const useSession = create<SessionState>((set, get) => ({
  job: null,
  status: "idle",

  async run(job) {
    const id = ++seq; // a newer request wins; stale responses are dropped
    set({ job, status: "loading", error: undefined, reply: undefined, opener: undefined, profile: undefined });
    const app = useApp.getState();
    try {
      if (job.kind === "reply") {
        const reply = await api.suggest(job.req);
        if (id !== seq) return;
        set({ status: "done", reply });
        if (job.crushId) {
          const crushes = useCrushes.getState();
          crushes.recordSession(job.crushId, { chat: job.req.messages, interest: reply.vibe.interest, ghost: reply.vibe.ghost?.risk, memory: reply.memory ?? [] });
          const crush = crushes.crushes.find((c) => c.id === job.crushId);
          if (crush && job.req.messages.at(-1)?.from === "them") void scheduleCrushNudge(crush);
        }
        useProgress.getState().award("reply");
        app.addHistory({
          source: "app",
          platform: job.req.platform ?? "other",
          theirName: job.req.theirName,
          tone: job.req.tone,
          lastMessage: job.req.messages.filter((m) => m.from === "them").at(-1)?.text,
          suggestions: reply.suggestions,
          vibe: reply.vibe,
        });
      } else if (job.kind === "profile") {
        const profile = await api.profileReview(job.req);
        if (id !== seq) return;
        set({ status: "done", profile });
        useProgress.getState().award("profile");
      } else {
        const opener = await api.openers(job.req);
        if (id !== seq) return;
        set({ status: "done", opener });
        useProgress.getState().award("opener");
        app.addHistory({ source: "opener", platform: job.req.platform ?? "other", tone: job.req.tone, suggestions: opener.openers });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      void useApp.getState().refreshMe();
    } catch (e) {
      if (id !== seq) return;
      set({ status: "error", error: { message: errorMessage(e), quota: e instanceof RizzApiError && e.code === "quota_exceeded" } });
    }
  },

  async retone(tone) {
    const job = get().job;
    if (!job || job.kind === "profile") return;
    useApp.getState().setDefaultTone(tone);
    await get().run({ ...job, req: { ...job.req, tone } } as Job);
  },

  async more() {
    const job = get().job;
    if (job) await get().run(job);
  },
}));
