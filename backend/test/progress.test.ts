import { describe, expect, it } from "vitest";
import { applyEvent, challengesFor, INITIAL_PROGRESS, levelFor, liveStreak, weekKey, xpFor } from "@rizz/shared";

const day = (s: string) => new Date(`${s}T12:00:00`);

describe("levels", () => {
  it("maps XP to levels with progress to next", () => {
    expect(levelFor(0).title).toBe("Rookie");
    expect(levelFor(150)).toMatchObject({ title: "Smooth Talker", progress: 0.25 });
    expect(levelFor(99999)).toMatchObject({ title: "Rizz God", next: null, progress: 1 });
  });
});

describe("xp", () => {
  it("scales practice XP with score", () => {
    expect(xpFor("practice", { score: 9 })).toBe(18);
    expect(xpFor("reply")).toBe(10);
  });
});

describe("streaks", () => {
  it("grows on consecutive days, resets after a gap, ignores same-day repeats", () => {
    let s = INITIAL_PROGRESS;
    s = applyEvent(s, "reply", {}, day("2026-09-24")).state;
    s = applyEvent(s, "reply", {}, day("2026-09-24")).state;
    expect(s.streak.count).toBe(1);
    s = applyEvent(s, "reply", {}, day("2026-09-25")).state;
    expect(s.streak.count).toBe(2);
    expect(liveStreak(s.streak, day("2026-09-26"))).toBe(2); // still alive until the end of the next day
    expect(liveStreak(s.streak, day("2026-09-27"))).toBe(0);
    s = applyEvent(s, "reply", {}, day("2026-09-28")).state;
    expect(s.streak).toMatchObject({ count: 1, best: 2 });
  });

  it("handles month boundaries", () => {
    let s = applyEvent(INITIAL_PROGRESS, "chat", {}, day("2026-09-30")).state;
    s = applyEvent(s, "chat", {}, day("2026-10-01")).state;
    expect(s.streak.count).toBe(2);
  });
});

describe("weekly challenges", () => {
  it("picks 3 distinct challenges, stable per week", () => {
    const a = challengesFor("2026-W39");
    expect(a).toHaveLength(3);
    expect(new Set(a.map((c) => c.id)).size).toBe(3);
    expect(challengesFor("2026-W39").map((c) => c.id)).toEqual(a.map((c) => c.id));
    expect(weekKey(day("2026-09-26"))).toBe("2026-W39");
  });

  it("completes a challenge once, awards the bonus, and resets next week", () => {
    const now = day("2026-09-26");
    const c = challengesFor(weekKey(now))[0]!;
    const meta = { score: 10, persona: "sarcastic", language: "hinglish", goal: "revive" };
    let s = INITIAL_PROGRESS;
    let completedAt = -1;
    for (let i = 0; i < c.target; i++) {
      const r = applyEvent(s, c.event, meta, now);
      if (r.completed.some((x) => x.id === c.id)) completedAt = i;
      s = r.state;
    }
    expect(completedAt).toBe(c.target - 1);
    expect(s.week.done).toContain(c.id);
    const again = applyEvent(s, c.event, meta, now);
    expect(again.completed.some((x) => x.id === c.id)).toBe(false);
    const nextWeek = applyEvent(s, c.event, meta, day("2026-10-05"));
    expect(nextWeek.state.week.key).toBe("2026-W41");
  });

  it("reports level-ups", () => {
    const r = applyEvent({ ...INITIAL_PROGRESS, xp: 95 }, "reply", {}, day("2026-09-26"));
    expect(r.levelUp?.title).toBe("Smooth Talker");
  });
});
