import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { RizzOverlay } from "../../modules/rizz-overlay";
import { Button, Card, Header, IconButton, Notice, Screen, Section, T } from "../components/ui";
import { colors, radius, space } from "../theme";

export default function Live() {
  const back = <IconButton name="chevron-back" label="Back" onPress={() => router.back()} filled style={{ marginLeft: -4 }} />;
  if (!RizzOverlay.available) {
    return (
      <Screen>
        <Header title="Live mode" left={back} />
        <Notice tone="info" text="Live mode needs Android — iPhones don't let apps see other apps' screens. Use the + button to scan a screenshot instead." />
      </Screen>
    );
  }
  return <LiveSetup back={back} />;
}

function LiveSetup({ back }: { back: React.ReactNode }) {
  const [overlayOk, setOverlayOk] = useState(RizzOverlay.hasOverlayPermission());
  const [running, setRunning] = useState(RizzOverlay.isRunning());
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(() => {
    setOverlayOk(RizzOverlay.hasOverlayPermission());
    setRunning(RizzOverlay.isRunning());
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = RizzOverlay.onStopped(() => setRunning(false));
    return () => sub?.remove();
  }, []);

  const start = async () => {
    setError(undefined);
    setStarting(true);
    try {
      const ok = await RizzOverlay.start();
      setRunning(ok);
      if (!ok) setError("Live mode needs screen access to read your chats. Tap Start and choose “Start now”.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start live mode");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen
      footer={
        running ? (
          <Button title="Stop Live mode" variant="secondary" icon="stop-circle-outline" onPress={() => { RizzOverlay.stop(); setRunning(false); }} />
        ) : (
          <Button title="Start Live mode" icon="radio-button-on" disabled={!overlayOk} loading={starting} onPress={start} />
        )
      }
    >
      <Header title="Live mode" subtitle="Replies right inside Instagram, Tinder, Snapchat…" left={back} />

      <Card style={{ marginBottom: space(6) }}>
        <Step n={1} done={overlayOk} title="Allow “Display over other apps”" body="Lets the ✨ bubble float above your chats." />
        {!overlayOk ? <Button title="Open settings" variant="secondary" size="md" onPress={() => RizzOverlay.openOverlaySettings()} style={{ marginBottom: space(4) }} /> : null}
        <Step n={2} done={running} title="Start Live mode" body="Android asks to share your screen. It's only read when you tap or hold the bubble." last />
      </Card>
      {error ? <Notice text={error} /> : null}

      <Section title="How it works">
        {[
          ["sparkles-outline", "Tap ✨ for replies", "Reads the chat on screen: Instagram, Snapchat, WhatsApp, Tinder, Messenger…"],
          ["reader-outline", "Hold ✨ to read the whole chat", "Then scroll up slowly and tap Done. Replies use the full history, not just the last few texts."],
          ["school-outline", "Ask the coach", "“Are they into me?”, “How do I ask them out?” — answers based on your actual chat."],
          ["swap-horizontal-outline", "Knows who said what", "Uses each app's bubble colours and layout. If a message lands on the wrong side, tap “Fix sides in app”."],
          ["copy-outline", "Tap a reply to copy it", "Then paste & send. Rizz AI never sends anything for you."],
        ].map(([icon, text, body]) => (
          <View key={text} style={styles.how}>
            <View style={styles.howIcon}>
              <Ionicons name={icon as "sparkles-outline"} size={18} color={colors.pink} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{text}</T>
              <T v="small" color={colors.textDim} style={{ marginTop: 2 }}>
                {body}
              </T>
            </View>
          </View>
        ))}
      </Section>

      <Notice tone="info" icon="shield-checkmark-outline" text="Nothing is recorded. The text is read on your phone, and only the messages (with numbers & emails removed) are sent to write replies." />
    </Screen>
  );
}

function Step({ n, done, title, body, last }: { n: number; done: boolean; title: string; body: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: space(3), marginBottom: last ? 0 : space(4) }}>
      <View style={[styles.stepDot, done && { backgroundColor: colors.success }]}>
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
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  how: { flexDirection: "row", alignItems: "flex-start", gap: space(3), marginBottom: space(4) },
  howIcon: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
});
