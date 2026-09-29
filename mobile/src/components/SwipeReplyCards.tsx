import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import type { ToneId } from "@rizz/shared";
import { useApp } from "../store";
import { colors, font, radius, space } from "../theme";
import { toast } from "./Toast";
import { T } from "./ui";

export function SwipeReplyCards({ items, tone, onSent }: { items: { text: string; why: string }[]; tone: ToneId; onSent?: (text: string) => void }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 44;
  const [active, setActive] = useState(0);
  const favorites = useApp((s) => s.favorites);
  const toggle = useApp((s) => s.toggleFavorite);
  return <View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 12} decelerationRate="fast" onMomentumScrollEnd={(e) => setActive(Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12)))))} contentContainerStyle={{ gap: 12, paddingRight: 20 }}>
      {items.map((item, i) => <View key={`${i}-${item.text}`} style={[styles.card, { width: cardWidth }]}>
        <View style={styles.top}><T v="small" color={colors.textDim}>{i + 1} / {items.length}</T><Pressable accessibilityLabel="Save this reply" onPress={() => toggle(item.text, tone)}><Ionicons name={favorites.some((f) => f.text === item.text) ? "heart" : "heart-outline"} size={27} color={favorites.some((f) => f.text === item.text) ? colors.pink : colors.textDim} /></Pressable></View>
        <T style={styles.line}>{item.text}</T>
        {item.why ? <T v="small" color={colors.textDim}>{item.why}</T> : null}
        <Pressable onPress={async () => { await Clipboard.setStringAsync(item.text); toast("Copied — go send it 🔥"); }} style={styles.copy}><Ionicons name="copy-outline" size={23} color={colors.bg} /><T v="bodyStrong" color={colors.bg} style={{ fontFamily: font.extrabold, fontSize: 17 }}>Copy reply</T></Pressable>
        {onSent ? <Pressable onPress={() => onSent(item.text)} style={styles.sent}><T v="small" color={colors.lime}>I sent this → keep the chat going</T></Pressable> : null}
      </View>)}
    </ScrollView>
    <View style={styles.dots}>{items.map((_, i) => <View key={i} style={[styles.dot, active === i && { backgroundColor: colors.lime }]} />)}</View>
  </View>;
}

const styles = StyleSheet.create({
  card: { minHeight: 340, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.xl, padding: space(5), justifyContent: "space-between" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  line: { color: colors.text, fontFamily: font.extrabold, fontSize: 33, lineHeight: 39, letterSpacing: -0.8, marginVertical: space(3) },
  copy: { height: 58, borderRadius: radius.pill, backgroundColor: colors.pink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(3), marginTop: space(4) },
  sent: { alignItems: "center", paddingTop: space(3) },
  dots: { flexDirection: "row", justifyContent: "center", gap: space(2), paddingVertical: space(4) },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.borderStrong },
});
