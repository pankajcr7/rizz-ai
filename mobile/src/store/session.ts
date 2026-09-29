/**
 * The current generation job (replies or openers) shown on the Results
 * screen. Not persisted. Re-running with another tone keeps everything else.
 */
import * as Haptics from "expo-haptics";
import { create } from "zustand";
import type { OpenersRequest, OpenersResponse, Preferences, ProfileReviewRequest, ProfileReviewResponse, SuggestRequest, SuggestResponse, ToneId } from "@rizz/shared";
import { api, errorMessage, RizzApiError } from "../api/client";
import { scheduleCrushNudge } from "../lib/nudges";
import { useCrushes } from "./crushes";
import { useApp } from "./index";
import { useProgress } from "./progress";

export type Job =
  | { kind: "reply"; req: SuggestRequest; crushId?: string }
  | { kind: "opener"; req: OpenersRequest }
  | { kind: "profile"; req: ProfileReviewRequest };

export type ReplyAdjustment = "shorter" | "less_flirty" | "more_casual" | "more_hindi";
export type StyleFeedback = NonNullable<Preferences["styleAvoid"]>[number];

interface SessionState {
  reset: () => void;
  job: Job | null;
  status: "idle" | "loading" | "done" | "error";
  reply?: SuggestResponse;
  opener?: OpenersResponse;
  profile?: ProfileReviewResponse;
  error?: { message: string; quota: boolean };
  run: (job: Job) => Promise<void>;
  retone: (tone: ToneId) => Promise<void>;
  more: () => Promise<void>;
  adjust: (kind: ReplyAdjustment) => Promise<void>;
  learnStyle: (feedback: StyleFeedback) => Promise<void>;
  fillMissing: (detail: string) => Promise<void>;
  continueChat: (sent: string, theirs: string) => Promise<void>;
}

let seq = 0;

export const useSession = create<SessionState>((set, get) => ({
  reset: () => { seq++; set({ job: null, status: "idle", reply: undefined, opener: undefined, profile: undefined, error: undefined }); },
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

  async adjust(kind) {
    const job = get().job;
    if (!job || job.kind !== "reply") return;
    const prefs: Preferences = { ...useApp.getState().prefs, ...(job.req.prefs ?? {}) };
    const instruction = {
      shorter: "Make these replies noticeably shorter and remove anything nonessential.",
      less_flirty: "Reduce the flirting. Keep the same meaning but make it more neutral and grounded.",
      more_casual: "Make these sound more casual and everyday, like a quick real text.",
      more_hindi: "Use more natural Hindi vocabulary in casual Roman-script Hinglish for this generation, matching the user's style examples where possible.",
    }[kind];
    if (kind === "shorter") prefs.length = "short";
    if (kind === "less_flirty") prefs.boldness = Math.max(1, prefs.boldness - 1);
    if (kind === "more_hindi") prefs.language = "hinglish";
    await get().run({ ...job, req: { ...job.req, prefs, notes: [job.req.notes, instruction].filter(Boolean).join("\n") } });
  },

  async learnStyle(feedback) {
    const job = get().job;
    if (!job || job.kind !== "reply") return;
    const app = useApp.getState();
    app.addStyleFeedback(feedback);
    const styleAvoid = [...new Set([...(job.req.prefs?.styleAvoid ?? []), feedback])] as NonNullable<Preferences["styleAvoid"]>;
    await get().run({ ...job, req: { ...job.req, prefs: { ...app.prefs, ...(job.req.prefs ?? {}), styleAvoid } } });
  },

  async fillMissing(detail) {
    const job = get().job;
    const clean = detail.trim();
    if (!job || job.kind !== "reply" || !clean) return;
    await get().run({
      ...job,
      req: {
        ...job.req,
        notes: [job.req.notes, `Personal detail supplied by the user for this reply: ${clean}`].filter(Boolean).join("\n"),
      },
    });
  },

  async continueChat(sent, theirs) {
    const job = get().job;
    const clean = theirs.trim();
    if (!job || job.kind !== "reply" || !clean) return;
    const messages = [...job.req.messages, { from: "me" as const, text: sent }, { from: "them" as const, text: clean }].slice(-60);
    useApp.getState().setDraftChat(messages);
    await get().run({ ...job, req: { ...job.req, messages, draft: undefined } });
  },
}));
