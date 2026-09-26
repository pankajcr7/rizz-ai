import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useApp } from "../store";
import { CRUSH_COLORS, useCrushes, type Crush } from "../store/crushes";
import { useProgress } from "../store/progress";
import { colors, font, GUTTER, space } from "../theme";
import { Sheet } from "./Sheet";
import { Button, Input, T } from "./ui";

export function CrushAvatar({ crush, size = 44 }: { crush: Pick<Crush, "name" | "color" | "waiting">; size?: number }) {
  const [a, b] = CRUSH_COLORS[crush.color % CRUSH_COLORS.length]!;
  return (
    <View>
      <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
        <T style={{ fontFamily: font.extrabold, fontSize: size * 0.42, color: "#fff" }}>{crush.name.slice(0, 1).toUpperCase()}</T>
      </LinearGradient>
      {crush.waiting ? <View style={[styles.dot, { right: size > 50 ? 4 : 0 }]} /> : null}
    </View>
  );
}

/** "Who's this?" — attach the chat to a crush so replies use their memory. */
export function CrushPicker() {
  const { crushes, activeId, setActive, add } = useCrushes();
  const { platform, theirName, setDraftChat, draftChat } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const award = useProgress((s) => s.award);

  const pick = (c: Crush) => {
    Haptics.selectionAsync().catch(() => {});
    if (activeId === c.id) return setActive(null);
    setActive(c.id);
    // Empty draft → pick up where you left off with them.
    if (!draftChat.length && c.chat.length) setDraftChat(c.chat);
  };

  const create = () => {
    if (!name.trim()) return;
    add(name, platform);
    award("crush_added");
    setName("");
    setOpen(false);
  };

  return (
    <View style={{ marginBottom: space(5) }}>
      <T v="caption" color={colors.textMute} style={{ marginBottom: space(3) }}>
        Who’s this?
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: space(4), paddingHorizontal: GUTTER }}>
        <Pressable
          onPress={() => {
            setName(theirName ?? "");
            setOpen(true);
          }}
          style={styles.item}
          accessibilityLabel="Add a crush"
        >
          <View style={styles.add}>
            <Ionicons name="add" size={22} color={colors.pink} />
          </View>
          <T v="small" color={colors.textDim}>
            New
          </T>
        </Pressable>
        {crushes.map((c) => {
          const on = c.id === activeId;
          return (
            <Pressable key={c.id} onPress={() => pick(c)} style={styles.item} accessibilityLabel={`${c.name}${on ? ", selected" : ""}`} accessibilityState={{ selected: on }}>
              <View style={[styles.ring, on && { borderColor: colors.pink }]}>
                <CrushAvatar crush={c} size={44} />
              </View>
              <T v="small" color={on ? colors.text : colors.textDim} numberOfLines={1} style={{ maxWidth: 64, fontFamily: on ? font.bold : font.medium }}>
                {c.name}
              </T>
            </Pressable>
          );
        })}
      </ScrollView>

      <Sheet open={open} onClose={() => setOpen(false)} title="New crush" footer={<Button title="Save" icon="heart" disabled={!name.trim()} onPress={create} />}>
        <Input value={name} onChangeText={setName} placeholder="Their name" autoFocus maxLength={40} onSubmitEditing={create} />
        <T v="small" color={colors.textMute} style={{ marginTop: space(3) }}>
          Rizz AI remembers what you learn about them (interests, inside jokes) and uses it in future replies. Saved only on this phone.
        </T>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { alignItems: "center", gap: 6, width: 64 },
  add: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  ring: { padding: 2, borderRadius: 30, borderWidth: 2, borderColor: "transparent" },
  dot: { position: "absolute", top: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.pink, borderWidth: 2, borderColor: colors.bg },
});
