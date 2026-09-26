/**
 * Gamification rules: XP, levels, daily streaks and weekly challenges.
 * Pure functions (no I/O) so they're easy to test; the app stores the state.
 */

export type ProgressEvent = "reply" | "opener" | "profile" | "share" | "practice" | "chat" | "crush_added";
export interface EventMeta {
  score?: number; // practice score 1-10
  persona?: string;
  language?: string;
  goal?: string;
}

export interface ProgressState {
  xp: number;
  streak: { count: number; best: number; lastDay: string | null };
  week: { key: string; counts: Record<string, number>; done: string[] };
}

export const INITIAL_PROGRESS: ProgressState = {
  xp: 0,
  streak: { count: 0, best: 0, lastDay: null },
  week: { key: "", counts: {}, done: [] },
};

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export const LEVELS = [
  { min: 0, title: "Rookie", emoji: "🐣" },
  { min: 100, title: "Smooth Talker", emoji: "😎" },
  { min: 300, title: "Charmer", emoji: "✨" },
  { min: 700, title: "Heartbreaker", emoji: "💘" },
  { min: 1500, title: "Rizz Lord", emoji: "👑" },
  { min: 3000, title: "Rizz God", emoji: "🔥" },
] as const;

export function levelFor(xp: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1]!.min) i++;
  const current = LEVELS[i]!;
  const next = LEVELS[i + 1];
  const progress = next ? (xp - current.min) / (next.min - current.min) : 1;
  return { index: i, ...current, next: next ?? null, progress: Math.max(0, Math.min(1, progress)) };
}

// ---------------------------------------------------------------------------
// XP per action
// ---------------------------------------------------------------------------

export function xpFor(event: ProgressEvent, meta: EventMeta = {}): number {
  switch (event) {
    case "reply":
    case "opener":
      return 10;
    case "profile":
      return 20;
    case "share":
      return 15;
    case "practice":
      return Math.max(1, Math.round((meta.score ?? 5) * 2));
    case "chat":
      return 3;
    case "crush_added":
      return 5;
  }
}

// ---------------------------------------------------------------------------
// Weekly challenges
// ---------------------------------------------------------------------------

export interface Challenge {
  id: string;
  title: string;
  emoji: string;
  event: ProgressEvent;
  target: number;
  reward: number;
  /** Extra condition on the event, if any. */
  test?: (m: EventMeta) => boolean;
}

export const CHALLENGE_POOL: Challenge[] = [
  { id: "practice_8", title: "Score 8+ in Practice", emoji: "🎯", event: "practice", target: 1, reward: 50, test: (m) => (m.score ?? 0) >= 8 },
  { id: "sarcastic_7", title: "Get 7+ vs the Sarcastic match", emoji: "🙄", event: "practice", target: 1, reward: 60, test: (m) => m.persona === "sarcastic" && (m.score ?? 0) >= 7 },
  { id: "replies_5", title: "Get replies 5 times", emoji: "💬", event: "reply", target: 5, reward: 40 },
  { id: "hinglish_3", title: "Reply in Hinglish 3 times", emoji: "🇮🇳", event: "reply", target: 3, reward: 40, test: (m) => m.language === "hinglish" },
  { id: "share_1", title: "Share a card to your story", emoji: "📸", event: "share", target: 1, reward: 50 },
  { id: "profile_1", title: "Get your profile reviewed", emoji: "🪞", event: "profile", target: 1, reward: 40 },
  { id: "crush_2", title: "Add 2 crush profiles", emoji: "💘", event: "crush_added", target: 2, reward: 30 },
  { id: "opener_3", title: "Write 3 openers", emoji: "👋", event: "opener", target: 3, reward: 40 },
  { id: "revive_1", title: "Revive a dead chat", emoji: "🧟", event: "reply", target: 1, reward: 40, test: (m) => m.goal === "revive" },
  { id: "practice_10", title: "Send 10 practice messages", emoji: "🎮", event: "practice", target: 10, reward: 50 },
];

/** ISO week key, e.g. "2026-W39". */
export function weekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Three challenges per week, the same for everyone that week. */
export function challengesFor(key: string): Challenge[] {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = [...CHALLENGE_POOL];
  const picked: Challenge[] = [];
  while (picked.length < 3 && pool.length) {
    h = (h * 1103515245 + 12345) >>> 0;
    picked.push(pool.splice(h % pool.length, 1)[0]!);
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Applying an event
// ---------------------------------------------------------------------------

/** Local calendar day, e.g. "2026-09-26". */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function previousDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return dayKey(new Date(y, m - 1, d - 1));
}

export interface ApplyResult {
  state: ProgressState;
  gained: number;
  levelUp: ReturnType<typeof levelFor> | null;
  completed: Challenge[];
  streakUp: boolean;
}

export function applyEvent(prev: ProgressState, event: ProgressEvent, meta: EventMeta = {}, now = new Date()): ApplyResult {
  const today = dayKey(now);
  const wk = weekKey(now);

  // Streak: any activity on consecutive days.
  let streak = prev.streak;
  let streakUp = false;
  if (streak.lastDay !== today) {
    const count = streak.lastDay === previousDay(today) ? streak.count + 1 : 1;
    streak = { count, best: Math.max(streak.best, count), lastDay: today };
    streakUp = true;
  }

  // Weekly challenges reset each ISO week.
  const week = prev.week.key === wk ? { ...prev.week, counts: { ...prev.week.counts }, done: [...prev.week.done] } : { key: wk, counts: {}, done: [] as string[] };
  const completed: Challenge[] = [];
  for (const c of challengesFor(wk)) {
    if (c.event !== event || week.done.includes(c.id) || (c.test && !c.test(meta))) continue;
    week.counts[c.id] = (week.counts[c.id] ?? 0) + 1;
    if (week.counts[c.id]! >= c.target) {
      week.done.push(c.id);
      completed.push(c);
    }
  }

  const gained = xpFor(event, meta) + completed.reduce((a, c) => a + c.reward, 0);
  const xp = prev.xp + gained;
  const before = levelFor(prev.xp);
  const after = levelFor(xp);
  return { state: { xp, streak, week }, gained, levelUp: after.index > before.index ? after : null, completed, streakUp };
}

/** Streak as displayed: it's broken if you missed yesterday entirely. */
export function liveStreak(s: ProgressState["streak"], now = new Date()): number {
  if (!s.lastDay) return 0;
  const today = dayKey(now);
  return s.lastDay === today || s.lastDay === previousDay(today) ? s.count : 0;
}
