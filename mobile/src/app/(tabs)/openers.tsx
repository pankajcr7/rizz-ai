import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { BrandHeader } from "../../components/BrandHeader";
import { toast } from "../../components/Toast";
import { Button, Input, Screen, T } from "../../components/ui";
import { pickScreenshot } from "../../lib/image";
import { useApp } from "../../store";
import { useCrushes } from "../../store/crushes";
import { useOpenerDraft } from "../../store/drafts";
import { useSession } from "../../store/session";
import { colors, font, radius, space } from "../../theme";

export default function Openers() {
  const { openerImage, setOpenerImage, openerBio, setOpenerBio } = useOpenerDraft();
  const { platform, defaultTone, prefs, history, favorites, toggleFavorite } = useApp();
  const crush = useCrushes((s) => s.crushes.find((c) => c.id === s.activeId));
  const run = useSession((s) => s.run);
  const { width } = useWindowDimensions();
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const latest = history.find((h) => h.source === "opener" && h.suggestions.length);
  const lines = latest?.suggestions.map((s) => s.text) ?? [];
  const cardWidth = width - 72;
  const pick = async () => { setBusy(true); try { setOpenerImage(await pickScreenshot()); } finally { setBusy(false); } };
  const generate = () => {
    void run({ kind: "opener", req: { platform: crush?.platform ?? platform, tone: defaultTone, bio: openerBio.trim() || undefined, image: openerImage ?? undefined, prefs } });
    router.push("/results");
  };

  return <Screen>
    <BrandHeader />
    <T style={styles.title}>First message, big energy.</T>
    <T v="body" color={colors.textDim} style={{ marginBottom: space(5) }}>One profile detail is all we need to find your opening line.</T>
    <Pressable onPress={() => void pick()} style={styles.profile} accessibilityLabel="Add their profile screenshot">
      <View style={styles.avatar}>{openerImage ? <Image source={{ uri: `data:${openerImage.mediaType};base64,${openerImage.data}` }} style={StyleSheet.absoluteFill} /> : <Ionicons name="person" size={40} color={colors.lime} />}</View>
      <View style={{ flex: 1 }}><T v="title">{crush?.name || "Their profile"}</T><T v="small" color={colors.textDim} numberOfLines={2} style={{ marginTop: space(1) }}>{openerBio.trim() || "Tap to add a screenshot · then tell us what stood out"}</T></View>
      <Ionicons name="add-circle" size={25} color={colors.lime} />
    </Pressable>
    <Input multiline value={openerBio} onChangeText={setOpenerBio} placeholder="Their bio, prompts, or a detail you noticed…" maxLength={2000} style={{ marginTop: space(3), minHeight: 94 }} />
    <Button title="generate ✨" loading={busy} disabled={!openerImage && !openerBio.trim()} onPress={generate} style={{ marginTop: space(4), marginBottom: space(6) }} />

    {lines.length ? <><T v="caption" color={colors.textDim} style={{ marginBottom: space(3) }}>SWIPE FOR YOUR OPENERS</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 12} decelerationRate="fast" onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12)))} contentContainerStyle={{ gap: 12, paddingRight: 24 }}>
        {lines.map((line, i) => <View key={`${i}-${line}`} style={[styles.card, { width: cardWidth }]}>
          <View style={styles.cardTop}><T v="small" color={colors.textDim}>{i + 1} / {lines.length}</T><Pressable accessibilityLabel="Save opener" onPress={() => toggleFavorite(line, latest!.tone)}><Ionicons name={favorites.some((f) => f.text === line) ? "heart" : "heart-outline"} size={26} color={favorites.some((f) => f.text === line) ? colors.pink : colors.textDim} /></Pressable></View>
          <T style={styles.line}>{line}</T>
          <Pressable accessibilityLabel="Copy opener" onPress={async () => { await Clipboard.setStringAsync(line); toast("Opener copied"); }} style={styles.copy}><Ionicons name="copy-outline" color={colors.bg} size={22} /><T v="bodyStrong" color={colors.bg}>Copy opener</T></Pressable>
        </View>)}
      </ScrollView>
      <View style={styles.dots}>{lines.map((_, i) => <View key={i} style={[styles.dot, active === i && { backgroundColor: colors.lime }]} />)}</View>
    </> : <View style={styles.empty}><Ionicons name="bulb" size={31} color={colors.lime} /><T style={styles.emptyTitle}>Open with something real.</T><T v="small" color={colors.textDim}>Add their profile above. Your personalized cards will show here.</T></View>}
  </Screen>;
}

const styles = StyleSheet.create({
  title: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 38, color: colors.text, letterSpacing: -0.8, marginBottom: space(2) },
  profile: { flexDirection: "row", alignItems: "center", gap: space(4), backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 2, borderRadius: radius.xl, padding: space(4), minHeight: 138 },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: colors.surface3, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  card: { minHeight: 325, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space(5), justifyContent: "space-between" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  line: { color: colors.text, fontFamily: font.extrabold, fontSize: 33, lineHeight: 39, letterSpacing: -0.8, marginVertical: space(5) },
  copy: { height: 56, borderRadius: radius.pill, backgroundColor: colors.pink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2) },
  dots: { flexDirection: "row", justifyContent: "center", gap: space(2), paddingVertical: space(5) },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.borderStrong },
  empty: { borderRadius: radius.xl, borderWidth: 2, borderColor: colors.border, minHeight: 260, backgroundColor: colors.surface, padding: space(6), justifyContent: "space-between" },
  emptyTitle: { fontFamily: font.extrabold, fontSize: 30, lineHeight: 36, color: colors.text, letterSpacing: -0.7 },
});
