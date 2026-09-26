import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { RizzOverlay } from "../../modules/rizz-overlay";
import { Button, Card, Header, IconButton, Input, Notice, Screen, Section, T } from "../components/ui";
import { colors, radius, space } from "../theme";

export default function KeyboardSetup() {
  const back = <IconButton name="chevron-back" label="Back" onPress={() => router.back()} filled style={{ marginLeft: -4 }} />;
  const [enabled, setEnabled] = useState(RizzOverlay.keyboard.isEnabled());
  const [selected, setSelected] = useState(RizzOverlay.keyboard.isSelected());
  const [tryText, setTryText] = useState("");

  const refresh = useCallback(() => {
    setEnabled(RizzOverlay.keyboard.isEnabled());
    setSelected(RizzOverlay.keyboard.isSelected());
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);
  useFocusEffect(refresh);

  if (!RizzOverlay.available) {
    return (
      <Screen>
        <Header title="Rizz Keyboard" left={back} />
        <Notice tone="info" text="The Rizz Keyboard is on Android first — iPhone is coming next. For now, use the + button to scan a screenshot." />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        !enabled ? (
          <Button title="Turn on Rizz Keyboard" icon="settings-outline" onPress={() => RizzOverlay.keyboard.openSettings()} />
        ) : !selected ? (
          <Button title="Switch to Rizz Keyboard" icon="swap-horizontal" onPress={() => RizzOverlay.keyboard.showPicker()} />
        ) : undefined
      }
    >
      <Header title="Rizz Keyboard" subtitle="Replies right where you type — in any app" left={back} />

      <Card style={{ marginBottom: space(6) }}>
        <Step n={1} done={enabled} title="Turn it on" body="Settings → On-screen keyboards → enable “Rizz AI Keyboard”." />
        <Step n={2} done={selected} title="Switch to it" body="Pick Rizz AI Keyboard. Your normal keyboard is one 🌐 tap away." />
        <Step n={3} done={false} title="Use it" body="Copy their message, tap ✨ on the keyboard, tap a reply to type it." last />
      </Card>

      {selected ? (
        <Section title="Try it here">
          <T v="small" color={colors.textDim} style={{ marginBottom: space(3) }}>
            Copy any message, tap this box, then tap ✨ on the keyboard.
          </T>
          <Input value={tryText} onChangeText={setTryText} placeholder="Tap here…" multiline />
        </Section>
      ) : null}

      <Section title="How it works">
        {[
          ["copy-outline", "Long-press their message → Copy"],
          ["sparkles-outline", "Tap ✨ Rizz on the keyboard"],
          ["hand-left-outline", "Tap a reply — it’s typed for you, you hit send"],
          ["create-outline", "Already typing? ✨ polishes your draft instead"],
        ].map(([icon, text]) => (
          <View key={text} style={styles.how}>
            <View style={styles.howIcon}>
              <Ionicons name={icon as "sparkles-outline"} size={18} color={colors.pink} />
            </View>
            <T v="bodyStrong" style={{ flex: 1 }}>
              {text}
            </T>
          </View>
        ))}
      </Section>

      <Notice
        tone="info"
        icon="shield-checkmark-outline"
        text="Android shows a standard warning for every keyboard. Rizz AI never stores what you type — it only reads your clipboard and draft when you tap ✨, and never sends a message for you."
      />
    </Screen>
  );
}

function Step({ n, done, title, body, last }: { n: number; done: boolean; title: string; body: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: space(3), marginBottom: last ? 0 : space(4) }}>
      <View style={[styles.dot, done && { backgroundColor: colors.success }]}>
        {done ? <Ionicons name="checkmark" size={16} color={colors.bg} /> : <T v="bodyStrong">{n}</T>}
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{title}</T>
        <T v="small" color={colors.textDim} style={{ marginTop: 2 }}>
          {body}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  how: { flexDirection: "row", alignItems: "center", gap: space(3), marginBottom: space(3) },
  howIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
});
