import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import type { ToneId } from "@rizz/shared";
import { useApp } from "../store";
import { colors, font, radius, space } from "../theme";
import { toast } from "./Toast";
import { T, type IconName } from "./ui";

/** A suggested reply. Tap anywhere to copy; actions for save / "I sent it". */
export function ReplyCard({ text, why, tone, onSent, index = 0 }: { text: string; why: string; tone: ToneId; onSent?: (t: string) => void; index?: number }) {
  const fav = useApp((s) => s.favorites.some((f) => f.text === text));
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const [copied, setCopied] = useState(false);
  const [enter] = useState(() => new Animated.Value(0));

  // Stagger cards in one by one.
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 320, delay: index * 120, useNativeDriver: true }).start();
  }, [enter, index]);

  const copy = async () => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setCopied(true);
    toast("Copied — go send it 🔥");
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      <Pressable onPress={copy} accessibilityHint="Copies this reply" style={({ pressed }) => [styles.card, copied && styles.copied, pressed && { opacity: 0.9 }]}>
        <T v="reply" selectable>
          {text}
        </T>
        {why ? (
          <T v="small" color={colors.textMute} style={{ marginTop: space(2) }}>
            {why}
          </T>
        ) : null}
        <View style={styles.actions}>
          <Action icon={copied ? "checkmark" : "copy-outline"} label={copied ? "Copied" : "Copy"} onPress={copy} color={copied ? colors.success : colors.text} />
          <Action icon={fav ? "heart" : "heart-outline"} label={fav ? "Saved" : "Save"} onPress={() => toggleFavorite(text, tone)} color={fav ? colors.pink : colors.textDim} />
          {onSent ? <Action icon="arrow-redo-outline" label="Sent it" onPress={() => onSent(text)} color={colors.textDim} /> : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Action({ icon, label, onPress, color }: { icon: IconName; label: string; onPress: () => void; color: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={styles.action}>
      <Ionicons name={icon} size={17} color={color} />
      <T v="small" color={color} style={{ fontFamily: font.semibold }}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), marginBottom: space(3) },
  copied: { borderColor: colors.success },
  actions: { flexDirection: "row", gap: space(5), marginTop: space(4), paddingTop: space(3), borderTopWidth: 1, borderTopColor: colors.border },
  action: { flexDirection: "row", alignItems: "center", gap: 6 },
});
