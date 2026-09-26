import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { ChatPreview } from "../../components/ChatPreview";
import { CrushAvatar } from "../../components/Crush";
import { Button, Card, EmptyState, Header, IconButton, Input, Screen, Section, T } from "../../components/ui";
import { cancelCrushNudge } from "../../lib/nudges";
import { useApp } from "../../store";
import { agoPhrase, useCrushes } from "../../store/crushes";
import { colors, radius, space } from "../../theme";

export default function CrushDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const crush = useCrushes((s) => s.crushes.find((c) => c.id === id));
  const { update, remove, removeFact, setActive } = useCrushes();
  const { setDraftChat, setDraftMeta } = useApp();
  const [notes, setNotes] = useState(crush?.notes ?? "");
  const back = <IconButton name="chevron-back" label="Back" onPress={() => router.back()} filled style={{ marginLeft: -4 }} />;

  if (!crush) {
    return (
      <Screen>
        <Header title="Crush" left={back} />
        <EmptyState icon="heart-dislike-outline" title="Not found" body="This crush profile was deleted." />
      </Screen>
    );
  }

  const continueChat = () => {
    setActive(crush.id);
    setDraftChat(crush.chat);
    setDraftMeta({ theirName: crush.name, platform: crush.platform });
    router.navigate("/");
  };

  const del = () => {
    const go = () => {
      void cancelCrushNudge(crush.id);
      remove(crush.id);
      router.back();
    };
    const msg = `This deletes everything Rizz AI remembers about ${crush.name}.`;
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(`Forget ${crush.name}? ${msg}`)) go();
    } else {
      Alert.alert(`Forget ${crush.name}?`, msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Forget", style: "destructive", onPress: go },
      ]);
    }
  };

  const latest = crush.vibe.at(-1)?.interest;

  return (
    <Screen footer={<Button title={crush.chat.length ? `Continue chat with ${crush.name}` : `Reply to ${crush.name}`} icon="chatbubble-ellipses" onPress={continueChat} />}>
      <Header title={crush.name} subtitle={`${crush.platform} · last chat ${agoPhrase(crush.lastAt)}`} left={back} right={<CrushAvatar crush={crush} size={48} />} />

      {crush.waiting ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: space(3), borderColor: colors.pink, marginBottom: space(5) }}>
          <T style={{ fontSize: 22 }}>👀</T>
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">They’re waiting on you</T>
            {crush.lastThem ? (
              <T v="small" color={colors.textDim} numberOfLines={2}>
                “{crush.lastThem}”
              </T>
            ) : null}
          </View>
        </Card>
      ) : null}

      <Section title="Vibe over time">
        <Card>
          {crush.vibe.length ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space(2), marginBottom: space(3) }}>
                <T v="display" color={latest! >= 55 ? colors.success : latest! >= 35 ? colors.warn : colors.danger}>
                  {latest}%
                </T>
                <T v="small" color={colors.textDim}>
                  {trend(crush.vibe.map((v) => v.interest))}
                </T>
              </View>
              <Sparkline values={crush.vibe.map((v) => v.interest)} />
              {crush.vibe.at(-1)?.ghost !== undefined ? (
                <T v="small" color={crush.vibe.at(-1)!.ghost! >= 60 ? colors.danger : crush.vibe.at(-1)!.ghost! >= 35 ? colors.warn : colors.success} style={{ marginTop: space(2) }}>
                  👻 Ghost risk {crush.vibe.at(-1)!.ghost}%
                </T>
              ) : null}
            </>
          ) : (
            <T v="small" color={colors.textDim}>
              Get replies with {crush.name} selected to start tracking the vibe.
            </T>
          )}
        </Card>
      </Section>

      <Section title={`What Rizz AI remembers · ${crush.facts.length}`}>
        {crush.facts.length ? (
          <View style={styles.wrap}>
            {crush.facts.map((f) => (
              <Pressable key={f} onPress={() => removeFact(crush.id, f)} style={styles.fact} accessibilityLabel={`${f}. Tap to forget.`}>
                <T v="small">{f}</T>
                <Ionicons name="close" size={13} color={colors.textMute} />
              </Pressable>
            ))}
          </View>
        ) : (
          <T v="small" color={colors.textDim}>
            Interests, plans and inside jokes show up here as you chat. Tap one to forget it.
          </T>
        )}
      </Section>

      <Section title="Your notes">
        <Input
          value={notes}
          onChangeText={setNotes}
          onBlur={() => update(crush.id, { notes: notes.trim() })}
          placeholder="e.g. met at Priya's party, loves Coldplay, don't mention her ex"
          multiline
          maxLength={500}
          style={{ minHeight: 80 }}
        />
      </Section>

      {crush.chat.length ? (
        <Section title="Last chat">
          <ChatPreview messages={crush.chat} onChange={(chat) => update(crush.id, { chat })} max={6} />
        </Section>
      ) : null}

      <Button title={`Plan a date with ${crush.name}`} icon="calendar-outline" variant="secondary" onPress={() => router.push({ pathname: "/date", params: { crushId: crush.id } })} style={{ marginBottom: space(3) }} />
      <Button title={`Forget ${crush.name}`} icon="trash-outline" variant="danger" size="md" onPress={del} />
    </Screen>
  );
}

function trend(v: number[]) {
  if (v.length < 2) return "first read";
  const d = v.at(-1)! - v.at(-2)!;
  return d > 3 ? `▲ ${d} since last chat` : d < -3 ? `▼ ${-d} since last chat` : "steady";
}

function Sparkline({ values }: { values: number[] }) {
  const W = 300;
  const H = 70;
  const pts = values.length === 1 ? [values[0]!, values[0]!] : values;
  const step = W / (pts.length - 1);
  const xy = pts.map((v, i) => [i * step, H - 6 - (v / 100) * (H - 12)] as const);
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" accessibilityLabel={`Vibe history: ${values.join(", ")} percent`}>
      <Polyline points={xy.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={colors.pink} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={xy.at(-1)![0]} cy={xy.at(-1)![1]} r={5} fill={colors.pink} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  fact: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.infoSoft, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
});
