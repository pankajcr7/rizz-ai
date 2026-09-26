import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { TONES } from "@rizz/shared";
import { ReplyCard } from "../../components/ReplyCard";
import { EmptyState, Header, IconButton, Input, Screen, Section, Segmented, T } from "../../components/ui";
import { CrushAvatar } from "../../components/Crush";
import { useApp, type HistoryItem } from "../../store";
import { ago, useCrushes } from "../../store/crushes";
import { colors, radius, space } from "../../theme";

type Tab = "crushes" | "favorites" | "history";

function dayLabel(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yest.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupByDay<T extends { at: number }>(items: T[]) {
  const groups: { label: string; items: T[] }[] = [];
  for (const it of items) {
    const label = dayLabel(it.at);
    const g = groups.at(-1);
    if (g && g.label === label) g.items.push(it);
    else groups.push({ label, items: [it] });
  }
  return groups;
}

export default function Saved() {
  const { favorites, history, removeHistory, toggleFavorite, saveHistory } = useApp();
  const [tab, setTab] = useState<Tab>("crushes");
  const crushes = useCrushes((s) => s.crushes);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string>();
  const query = q.trim().toLowerCase();

  const favs = useMemo(
    () => favorites.filter((f) => !query || f.text.toLowerCase().includes(query)).map((f) => ({ ...f, at: f.savedAt })),
    [favorites, query],
  );
  const hist = useMemo(
    () => history.filter((h) => !query || [h.theirName, h.lastMessage, ...h.suggestions.map((s) => s.text)].some((t) => t?.toLowerCase().includes(query))),
    [history, query],
  );

  return (
    <Screen>
      <Header title="Saved" subtitle="Stored only on this phone" />
      <Segmented
        options={[
          { id: "crushes" as Tab, label: "Crushes", icon: "people-outline" },
          { id: "favorites" as Tab, label: "Saved", icon: "heart-outline" },
          { id: "history" as Tab, label: "History", icon: "time-outline" },
        ]}
        value={tab}
        onChange={setTab}
        style={{ marginBottom: space(3) }}
      />
      {tab !== "crushes" && (tab === "favorites" ? favorites.length : history.length) > 3 ? (
        <Input value={q} onChangeText={setQ} placeholder="Search…" style={{ marginBottom: space(4) }} returnKeyType="search" />
      ) : (
        <View style={{ height: space(2) }} />
      )}

      {tab === "crushes" ? (
        crushes.length ? (
          [...crushes]
            .sort((a, b) => Number(b.waiting) - Number(a.waiting) || b.lastAt - a.lastAt)
            .map((c) => {
              const v = c.vibe.at(-1)?.interest;
              return (
                <Pressable key={c.id} onPress={() => router.push(`/crush/${c.id}`)} style={({ pressed }) => [styles.row, { marginBottom: space(3) }, pressed && { opacity: 0.85 }]}>
                  <CrushAvatar crush={c} size={46} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
                      <T v="bodyStrong">{c.name}</T>
                      {v !== undefined ? (
                        <T v="small" color={v >= 55 ? colors.success : v >= 35 ? colors.warn : colors.danger}>
                          {v}%
                        </T>
                      ) : null}
                    </View>
                    <T v="small" color={c.waiting ? colors.pink : colors.textDim} numberOfLines={1}>
                      {c.waiting ? `Waiting on you · ${ago(c.lastAt)}` : c.lastThem ? `“${c.lastThem}”` : `${c.facts.length} things remembered`}
                    </T>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMute} />
                </Pressable>
              );
            })
        ) : (
          <EmptyState
            icon="people-outline"
            title="No crushes yet"
            body="Tap + New under “Who’s this?” on the Reply tab. Rizz AI will remember what you learn about them."
            action={{ label: "Add one", onPress: () => router.navigate("/") }}
          />
        )
      ) : null}

      {tab === "favorites" ? (
        favs.length ? (
          groupByDay(favs).map((g) => (
            <Section key={g.label} title={g.label}>
              {g.items.map((f) => (
                <View key={f.id}>
                  <T v="caption" color={colors.textMute} style={{ marginBottom: space(1.5) }}>
                    {TONES[f.tone].emoji} {TONES[f.tone].label}
                  </T>
                  <ReplyCard text={f.text} why="" tone={f.tone} />
                </View>
              ))}
            </Section>
          ))
        ) : (
          <EmptyState
            icon="heart-outline"
            title={query ? "No matches" : "No saved replies yet"}
            body={query ? "Try a different search." : "Tap ♡ Save on any reply you love and it'll live here."}
            action={query ? undefined : { label: "Get replies", onPress: () => router.navigate("/") }}
          />
        )
      ) : null}

      {tab === "history" ? (
        hist.length ? (
          groupByDay(hist).map((g) => (
            <Section key={g.label} title={g.label}>
              {g.items.map((h) => (
                <HistoryRow key={h.id} h={h} open={open === h.id} onToggle={() => setOpen(open === h.id ? undefined : h.id)} onDelete={() => removeHistory(h.id)} onFav={toggleFavorite} />
              ))}
            </Section>
          ))
        ) : (
          <EmptyState
            icon="time-outline"
            title={!saveHistory ? "History is off" : query ? "No matches" : "No history yet"}
            body={!saveHistory ? "Turn on Keep history in Me to see past sessions here." : "Your recent replies and openers will show up here."}
          />
        )
      ) : null}
    </Screen>
  );
}

function HistoryRow({ h, open, onToggle, onDelete }: { h: HistoryItem; open: boolean; onToggle: () => void; onDelete: () => void; onFav: (t: string, tone: HistoryItem["tone"]) => void }) {
  const icon = h.source === "opener" ? "flash" : h.source === "live" ? "radio-button-on" : "chatbubble-ellipses";
  const title = h.source === "opener" ? "Opener" : h.theirName ? `Reply to ${h.theirName}` : "Reply";
  return (
    <View style={{ marginBottom: space(3) }}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={17} color={colors.pink} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
            <T v="bodyStrong">{title}</T>
            {h.vibe ? (
              <T v="small" color={h.vibe.interest >= 55 ? colors.success : h.vibe.interest >= 35 ? colors.warn : colors.danger}>
                {h.vibe.interest}%
              </T>
            ) : null}
          </View>
          <T v="small" color={colors.textDim} numberOfLines={1}>
            {h.lastMessage ? `“${h.lastMessage}”` : h.suggestions[0]?.text}
          </T>
        </View>
        <T v="small" color={colors.textMute}>
          {new Date(h.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
        </T>
        <IconButton name="trash-outline" label="Delete" onPress={onDelete} size={17} color={colors.textMute} style={{ width: 32, height: 32 }} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: space(3) }}>
          {h.suggestions.map((s, i) => (
            <ReplyCard key={s.text} text={s.text} why={s.why} tone={h.tone} index={i} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space(3), backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(3) },
  rowIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
});
