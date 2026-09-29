import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { challengesFor, levelFor, liveStreak, weekKey } from "@rizz/shared";
import { Card, IconButton, Screen, Section, T } from "../components/ui";
import { useApp } from "../store";
import { useProgress } from "../store/progress";
import { colors, font, radius, space } from "../theme";

export default function Progress() {
  const { xp, streak, week } = useProgress();
  const history = useApp((s) => s.history);
  const level = levelFor(xp);
  const days = liveStreak(streak);
  const replies = history.filter((h) => h.source !== "opener").length;
  const openers = history.filter((h) => h.source === "opener").length;
  const weekId = weekKey(new Date());
  const challenges = challengesFor(weekId);
  const counts = week.key === weekId ? week.counts : {};
  const done = week.key === weekId ? week.done : [];
  const today = new Date();
  const activity = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today); day.setDate(today.getDate() - (6 - i));
    const key = day.toDateString();
    return { label: day.toLocaleDateString(undefined, { weekday: "short" }), count: history.filter((h) => new Date(h.at).toDateString() === key).length };
  });
  const max = Math.max(1, ...activity.map((d) => d.count));
  const achievements = [
    { icon: "😎", title: "smooth talker", unlocked: replies >= 5, bg: colors.lime },
    { icon: "💗", title: "first spark", unlocked: history.some((h) => (h.vibe?.interest ?? 0) >= 75), bg: colors.pink },
    { icon: "👑", title: "comeback king", unlocked: streak.best >= 7, bg: colors.surface2 },
  ];

  return <Screen>
    <View style={styles.header}><IconButton name="arrow-back" label="Back" color={colors.text} onPress={() => router.back()} /><T v="title">Streaks</T></View>
    <View style={styles.hero}><T v="caption" color={colors.textDim}>{"YOU'RE ON A"}</T><T style={styles.streak}><T style={{ color: colors.lime }}>{days}</T> day{days === 1 ? "" : "s"}{"\n"}streak 🔥</T><T v="body" color={colors.textDim}>Keep the momentum going!</T></View>
    <View style={styles.stats}>
      <Stat icon="chatbubbles" value={replies} label="recent replies" color={colors.lime} />
      <Stat icon="paper-plane" value={openers} label="recent openers" color={colors.pink} />
      <Stat icon="trophy" value={level.index + 1} label="rizz level" color={colors.lime} />
    </View>
    <Card style={styles.activity}><View style={styles.activityHead}><T v="headline">Your activity</T><T v="small" color={colors.textDim}>Last 7 days⌄</T></View>
      <View style={styles.chart}>{activity.map((d, i) => <View key={i} style={styles.chartCol}><T v="small" color={colors.textDim}>{d.count || ""}</T><View style={[styles.bar, { height: Math.max(8, (d.count / max) * 132), opacity: d.count ? 1 : 0.35 }]} /><T v="small" color={colors.textDim}>{d.label}</T></View>)}</View>
    </Card>
    <View style={styles.sectionTitle}><T v="title">Achievements</T><T v="small" color={colors.pink}>{achievements.filter((a) => a.unlocked).length} / {achievements.length} unlocked</T></View>
    <View style={styles.achievements}>{achievements.map((a) => <View key={a.title} style={[styles.achievement, { backgroundColor: a.bg }, !a.unlocked && { opacity: 0.45 }]}><T style={{ fontSize: 36 }}>{a.icon}</T><T v="small" color={a.bg === colors.surface2 ? colors.text : colors.bg} style={{ fontFamily: font.extrabold, textAlign: "center" }}>{a.title}</T></View>)}</View>
    <Section title="THIS WEEK'S CHALLENGES" style={{ marginTop: space(8) }}>{challenges.map((c) => {
      const n = Math.min(c.target, counts[c.id] ?? 0);
      return <Card key={c.id} style={{ marginBottom: space(3), flexDirection: "row", alignItems: "center", gap: space(3) }}><T style={{ fontSize: 27 }}>{done.includes(c.id) ? "✅" : c.emoji}</T><View style={{ flex: 1 }}><T v="bodyStrong">{c.title}</T><View style={styles.track}><View style={{ width: `${(n / c.target) * 100}%`, height: 5, backgroundColor: colors.lime, borderRadius: 3 }} /></View></View><T v="small" color={colors.lime}>{n}/{c.target}</T></Card>;
    })}</Section>
    <Pressable onPress={() => router.push("/settings")} style={styles.more}><T v="bodyStrong">See your profile</T><Ionicons name="arrow-forward" color={colors.lime} size={20} /></Pressable>
  </Screen>;
}

function Stat({ icon, value, label, color }: { icon: "chatbubbles" | "paper-plane" | "trophy"; value: number; label: string; color: string }) {
  return <View style={styles.stat}><View style={[styles.statIcon, { backgroundColor: color }]}><Ionicons name={icon} size={21} color={colors.bg} /></View><T style={styles.statValue}>{value}</T><T v="small" color={colors.textDim} numberOfLines={1}>{label}</T></View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space(3), paddingTop: space(4), marginBottom: space(5) },
  hero: { minHeight: 270, borderRadius: radius.xl, backgroundColor: colors.surface, padding: space(6), justifyContent: "space-between", marginBottom: space(4) },
  streak: { color: colors.text, fontFamily: font.extrabold, fontSize: 61, lineHeight: 64, letterSpacing: -2.4 },
  stats: { flexDirection: "row", gap: space(2), marginBottom: space(4) },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space(3), minHeight: 108, justifyContent: "space-between" },
  statIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  statValue: { fontFamily: font.extrabold, fontSize: 22, color: colors.text, lineHeight: 25 },
  activity: { minHeight: 245, marginBottom: space(6) },
  activityHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 172, borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: space(4) },
  chartCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: space(2), paddingBottom: space(2) },
  bar: { width: "58%", borderRadius: 7, backgroundColor: colors.lime },
  sectionTitle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space(4) },
  achievements: { flexDirection: "row", gap: space(2) },
  achievement: { flex: 1, minHeight: 130, borderRadius: radius.lg, alignItems: "center", justifyContent: "space-around", padding: space(2) },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.surface3, marginTop: space(2), overflow: "hidden" },
  more: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space(5) },
});
