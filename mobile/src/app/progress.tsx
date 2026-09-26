import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { challengesFor, levelFor, liveStreak, weekKey, LEVELS } from "@rizz/shared";
import { Card, Header, IconButton, Screen, Section, T } from "../components/ui";
import { useProgress } from "../store/progress";
import { colors, font, gradient, radius, space } from "../theme";

const HOW = [
  ["💬", "Get replies or openers", "+10"],
  ["🎮", "Practice message", "+2 × score"],
  ["🪞", "Profile review", "+20"],
  ["📸", "Share a card", "+15"],
  ["🧠", "Chat with your wingman", "+3"],
];

export default function Progress() {
  const { xp, streak, week } = useProgress();
  const level = levelFor(xp);
  const s = liveStreak(streak);
  const key = weekKey(new Date());
  const challenges = challengesFor(key);
  const counts = week.key === key ? week.counts : {};
  const done = week.key === key ? week.done : [];
  const back = <IconButton name="chevron-back" label="Back" onPress={() => router.back()} filled style={{ marginLeft: -4 }} />;

  return (
    <Screen>
      <Header title="Your rizz level" left={back} />

      <Card style={{ alignItems: "center", paddingVertical: space(7), marginBottom: space(5) }}>
        <T style={{ fontSize: 56 }}>{level.emoji}</T>
        <T v="title" style={{ marginTop: space(2) }}>
          {level.title}
        </T>
        <T v="small" color={colors.textDim} style={{ marginTop: 2 }}>
          {xp} XP{level.next ? ` · ${level.next.min - xp} to ${level.next.title}` : " · max level"}
        </T>
        <View style={styles.track}>
          <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 10, width: `${Math.max(4, level.progress * 100)}%`, borderRadius: 5 }} />
        </View>
      </Card>

      <View style={{ flexDirection: "row", gap: space(3), marginBottom: space(6) }}>
        <Card style={{ flex: 1, alignItems: "center" }}>
          <T style={{ fontSize: 28 }}>🔥</T>
          <T v="title">{s}</T>
          <T v="small" color={colors.textDim}>
            day streak
          </T>
        </Card>
        <Card style={{ flex: 1, alignItems: "center" }}>
          <T style={{ fontSize: 28 }}>🏆</T>
          <T v="title">{streak.best}</T>
          <T v="small" color={colors.textDim}>
            best streak
          </T>
        </Card>
      </View>

      <Section title="This week's challenges">
        {challenges.map((c) => {
          const n = Math.min(c.target, counts[c.id] ?? 0);
          const complete = done.includes(c.id);
          return (
            <Card key={c.id} style={[{ marginBottom: space(3), flexDirection: "row", alignItems: "center", gap: space(3) }, complete && { borderColor: colors.success }]}>
              <T style={{ fontSize: 26 }}>{complete ? "✅" : c.emoji}</T>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{c.title}</T>
                <View style={[styles.track, { marginTop: space(2), height: 6 }]}>
                  <View style={{ height: 6, width: `${(n / c.target) * 100}%`, backgroundColor: complete ? colors.success : colors.pink, borderRadius: 3 }} />
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <T v="small" style={{ fontFamily: font.bold }}>
                  {n}/{c.target}
                </T>
                <T v="small" color={colors.amber}>
                  +{c.reward}
                </T>
              </View>
            </Card>
          );
        })}
        <T v="small" color={colors.textMute}>
          New challenges every Monday.
        </T>
      </Section>

      <Section title="How to earn XP">
        <Card>
          {HOW.map(([e, t, x], i) => (
            <View key={t} style={[styles.row, i < HOW.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <T style={{ fontSize: 18 }}>{e}</T>
              <T v="body" style={{ flex: 1 }}>
                {t}
              </T>
              <T v="small" color={colors.amber} style={{ fontFamily: font.bold }}>
                {x}
              </T>
            </View>
          ))}
        </Card>
      </Section>

      <Section title="Levels">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
          {LEVELS.map((l, i) => (
            <View key={l.title} style={[styles.level, i <= level.index && { borderColor: colors.pink, backgroundColor: colors.accentSoft }]}>
              <T v="small">
                {l.emoji} {l.title}
              </T>
              <T v="small" color={colors.textMute} style={{ fontSize: 11 }}>
                {l.min} XP
              </T>
            </View>
          ))}
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { alignSelf: "stretch", height: 10, borderRadius: 5, backgroundColor: colors.surface3, overflow: "hidden", marginTop: space(4) },
  row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3) },
  level: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(2) },
});
