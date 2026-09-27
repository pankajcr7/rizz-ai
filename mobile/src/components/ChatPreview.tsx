import { Pressable, StyleSheet, View } from "react-native";
import type { ChatMessage } from "@rizz/shared";
import { colors, radius, space } from "../theme";
import { T } from "./ui";

/** The chat as the AI will see it. Tap a bubble to flip sides; long-press to remove. */
export function ChatPreview({ messages, onChange, max = 8 }: { messages: ChatMessage[]; onChange: (m: ChatMessage[]) => void; max?: number }) {
  if (!messages.length) return null;
  const shown = messages.slice(-max);
  const offset = messages.length - shown.length;
  return (
    <View>
      {offset > 0 ? (
        <T v="small" color={colors.textMute} style={{ textAlign: "center", marginBottom: space(2) }}>
          + {offset} earlier messages
        </T>
      ) : null}
      {shown.map((m, i) => {
        const index = offset + i;
        const mine = m.from === "me";
        return (
          <Pressable
            key={index}
            accessibilityLabel={`${mine ? "You" : "Them"}: ${m.text}. Tap to switch sides, long-press to remove.`}
            onPress={() => onChange(messages.map((x, j) => (j === index ? { ...x, from: mine ? "them" : "me" } : x)))}
            onLongPress={() => onChange(messages.filter((_, j) => j !== index))}
            style={[styles.bubble, mine ? styles.me : styles.them]}
          >
            <T v="body" color={mine ? colors.bg : colors.text}>
              {m.text}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "82%", paddingHorizontal: space(3.5), paddingVertical: space(2.5), borderRadius: radius.lg, marginBottom: space(1.5) },
  me: { alignSelf: "flex-end", backgroundColor: colors.meBubble, borderBottomRightRadius: 6 },
  them: { alignSelf: "flex-start", backgroundColor: colors.themBubble, borderBottomLeftRadius: 6 },
});
