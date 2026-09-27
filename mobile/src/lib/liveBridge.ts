/**
 * Connects the native live-mode bubble (Android) to the backend:
 *   tap ✨        → on-device OCR of this screen → /v1/suggest → native panel
 *   hold ✨       → every screen read while scrolling up → stitched here → /v1/suggest with full history
 *   "Ask coach"   → /v1/chat (coach) with the chat as context, answered in the panel
 * Tone chips and "New ideas" re-run with the last capture.
 */
import { router } from "expo-router";
import { chatStats, mostCommon, statsLine, stitchFrames, TONES, type ChatMessage, type ChatTurn, type Platform, type ToneId } from "@rizz/shared";
import { RizzOverlay, type CapturedChat, type PanelState } from "../../modules/rizz-overlay";
import { api, RizzApiError } from "../api/client";
import { useApp } from "../store";
import { useCrushes } from "../store/crushes";
import { LIVE_TONES } from "./options";

type LiveChat = {
  messages: ChatMessage[];
  theirName?: string;
  platform: Platform;
  /** Read by scrolling through the history, not just one screen. */
  wholeChat: boolean;
};

/** The last messages go in `messages`; older ones travel as `earlier` context. */
const RECENT = 60;
const MAX_EARLIER = 300;

const COACH_CHIPS = ["Are they into me?", "What should I reply?", "Analyze our whole chat", "How do I ask them out?", "Did I mess up?"];

let lastChat: LiveChat | null = null;
let lastResult: PanelState | null = null;
let coachTurns: ChatTurn[] = [];
let currentTone: ToneId | null = null;
let requestSeq = 0;

const tonesForPanel = () => LIVE_TONES.map((id) => ({ id, label: TONES[id].label, emoji: TONES[id].emoji }));

function toLiveChat(c: CapturedChat): LiveChat {
  const clean = (m: ChatMessage[]) => m.map((x) => ({ from: x.from, text: x.text.trim().slice(0, 1000) })).filter((x) => x.text);
  if (c.mode === "history") {
    const { messages } = stitchFrames(c.frames);
    const platform = mostCommon(c.platforms.filter((p) => p !== "other")) ?? "other";
    return { messages: clean(messages), theirName: mostCommon(c.names)?.slice(0, 60), platform, wholeChat: true };
  }
  return { messages: clean(c.messages), theirName: c.theirName?.slice(0, 60) ?? undefined, platform: c.platform ?? "other", wholeChat: false };
}

function errorPanel(e: unknown): PanelState {
  const code = e instanceof RizzApiError ? e.code : undefined;
  const title = code === "quota_exceeded" ? "Daily free limit reached" : code === "blocked_minor" ? "Can't help with this chat" : "Couldn't get replies";
  const message =
    code === "quota_exceeded" ? "Open Rizz AI to go Pro for unlimited replies." : e instanceof Error ? e.message : "Try again.";
  return { state: "error", title, message };
}

async function run(tone: ToneId) {
  const chat = lastChat;
  if (!chat) return;
  const seq = ++requestSeq; // ignore stale responses if the user taps another tone
  currentTone = tone;
  const { prefs, addHistory, setQuota } = useApp.getState();
  const crushes = useCrushes.getState();
  const crush = chat.theirName ? crushes.findByName(chat.theirName, chat.platform) : undefined;
  const messages = chat.messages.slice(-RECENT);
  const earlier = chat.messages.slice(0, -RECENT).slice(-MAX_EARLIER);

  try {
    const result = await api.suggest({
      platform: chat.platform,
      messages,
      earlier: earlier.length ? earlier : undefined,
      tone,
      theirName: chat.theirName,
      memory: crush?.facts.length ? crush.facts : undefined,
      prefs,
    });
    if (seq !== requestSeq) return;
    const name = chat.theirName ?? "this chat";
    lastResult = {
      state: "result",
      title: chat.wholeChat ? `${name} · whole chat read ✨` : chat.theirName ? `Replies for ${chat.theirName} ✨` : "Rizz AI ✨",
      activeTone: tone,
      tones: tonesForPanel(),
      suggestions: result.suggestions,
      vibe: result.vibe,
      stats: chat.wholeChat ? statsLine(chatStats(chat.messages)) : undefined,
      safety: result.safety,
      coachTip: result.coachTip,
      wholeChat: chat.wholeChat,
    };
    RizzOverlay.showPanel(lastResult);
    addHistory({
      source: "live",
      platform: chat.platform,
      theirName: chat.theirName,
      tone,
      lastMessage: messages.filter((m) => m.from === "them").at(-1)?.text,
      suggestions: result.suggestions,
      vibe: result.vibe,
    });
    if (crush) {
      crushes.recordSession(crush.id, { chat: chat.messages, interest: result.vibe.interest, ghost: result.vibe.ghost?.risk, memory: result.memory });
    }
    api.me().then((r) => setQuota(r.quota)).catch(() => {});
  } catch (e) {
    if (seq === requestSeq) RizzOverlay.showPanel(errorPanel(e));
  }
}

function coachPanel(thinking = false, notice?: string): PanelState {
  const shown = coachTurns.slice(-6);
  return {
    state: "coach",
    title: `🧠 Coach${lastChat?.theirName ? ` · ${lastChat.theirName}` : ""}`,
    intro: `I've read ${lastChat?.messages.length ?? 0} messages. Ask me anything about this chat.`,
    turns: notice ? [...shown, { role: "assistant" as const, content: notice }] : shown,
    chips: coachTurns.length ? COACH_CHIPS.slice(1, 4) : COACH_CHIPS,
    thinking,
  };
}

async function askCoach(question: string) {
  const chat = lastChat;
  if (!chat) return;
  const seq = ++requestSeq;
  coachTurns = [...coachTurns, { role: "user" as const, content: question.slice(0, 2000) }].slice(-20);
  RizzOverlay.showPanel(coachPanel(true));
  const { prefs } = useApp.getState();
  try {
    const res = await api.chat({
      mode: "coach",
      turns: coachTurns,
      context: { platform: chat.platform, theirName: chat.theirName, messages: chat.messages.slice(-360) },
      prefs,
    });
    if (seq !== requestSeq) return;
    const content = res.safety.flag !== "none" && res.safety.message ? `${res.reply}\n⚠️ ${res.safety.message}` : res.reply;
    coachTurns = [...coachTurns, { role: "assistant" as const, content: content.slice(0, 2000) }].slice(-20);
    RizzOverlay.showPanel(coachPanel());
  } catch (e) {
    if (seq !== requestSeq) return;
    coachTurns = coachTurns.slice(0, -1); // let them ask again
    const err = errorPanel(e);
    RizzOverlay.showPanel(coachPanel(false, `⚠️ ${err.state === "error" ? err.message : "Try again."}`));
  }
}

/** "Fix sides in app": load this chat into the Reply screen, where each bubble can be flipped. */
function openInApp() {
  const chat = lastChat;
  if (!chat) return;
  const { setDraftChat, setDraftMeta } = useApp.getState();
  setDraftChat(chat.messages.slice(-RECENT));
  setDraftMeta({ theirName: chat.theirName, platform: chat.platform });
  router.navigate("/");
}

/** Call once at app start. Returns an unsubscribe function. */
export function startLiveBridge(): () => void {
  if (!RizzOverlay.available) return () => {};
  const subs = [
    RizzOverlay.onCapture((captured) => {
      lastChat = toLiveChat(captured);
      const target = RizzOverlay.smart.captureTarget();
      if (target && (!lastChat.theirName || lastChat.theirName.trim().toLowerCase() === target.name.trim().toLowerCase())) {
        lastChat = { ...lastChat, theirName: target.name, platform: target.platform as Platform };
      }
      lastResult = null;
      coachTurns = [];
      if (!lastChat.messages.length) {
        RizzOverlay.showPanel({ state: "error", title: "No chat found here", message: "Open a conversation and try again." });
        return;
      }
      // Save the scan before requesting suggestions, including when the network is unavailable.
      if (lastChat.theirName && lastChat.platform !== "other") {
        const state = useCrushes.getState();
        const person = state.findByName(lastChat.theirName, lastChat.platform)
          ?? state.add(lastChat.theirName, lastChat.platform);
        state.saveChat(person.id, lastChat.messages);
        RizzOverlay.smart.saveConversation(lastChat.platform, lastChat.theirName, lastChat.messages, lastChat.wholeChat);
        lastChat = { ...lastChat, messages: useCrushes.getState().findByName(lastChat.theirName, lastChat.platform)?.chat ?? lastChat.messages };
      }
      void run(useApp.getState().defaultTone);
    }),
    RizzOverlay.onToneChange((tone) => {
      if (tone in TONES) void run(tone as ToneId);
    }),
    RizzOverlay.onRegenerate(() => {
      void run(currentTone ?? useApp.getState().defaultTone);
    }),
    RizzOverlay.onAction((a) => {
      if (a.action === "coach_open") RizzOverlay.showPanel(coachPanel());
      else if (a.action === "coach_ask") void askCoach(a.question);
      else if (a.action === "show_replies") {
        if (lastResult) RizzOverlay.showPanel(lastResult);
        else void run(currentTone ?? useApp.getState().defaultTone);
      } else if (a.action === "open_in_app") openInApp();
    }),
    RizzOverlay.onStopped(() => {
      lastChat = null;
      lastResult = null;
      coachTurns = [];
    }),
  ];
  return () => subs.forEach((s) => s?.remove());
}
