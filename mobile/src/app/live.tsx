import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, View } from "react-native";
import { RizzOverlay } from "../../modules/rizz-overlay";
import { Button, Notice, Screen, T } from "../components/ui";
import { colors, font, radius, space } from "../theme";

const supported = RizzOverlay.available;

export default function Live() {
  const [overlayOk, setOverlayOk] = useState(RizzOverlay.hasOverlayPermission());
  const [running, setRunning] = useState(RizzOverlay.isRunning());
  const [pendingChat, setPendingChat] = useState(RizzOverlay.smart.pendingChat());
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(() => {
    setOverlayOk(RizzOverlay.hasOverlayPermission());
    setRunning(RizzOverlay.isRunning());
    setPendingChat(RizzOverlay.smart.pendingChat());
  }, []);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);
  useEffect(() => {
    const sub = RizzOverlay.onStopped(() => setRunning(false));
    return () => sub?.remove();
  }, []);

  const start = async () => {
    if (!overlayOk) {
      RizzOverlay.openOverlaySettings();
      return;
    }
    setError(undefined);
    setStarting(true);
    try {
      const ok = await RizzOverlay.start();
      setRunning(ok);
      if (ok && pendingChat) {
        let attempts = 0;
        const openWhenReady = () => {
          if (RizzOverlay.smart.openPendingChat() || ++attempts >= 12) return;
          setTimeout(openWhenReady, 250);
        };
        openWhenReady();
      }
      if (!ok) setError("Android needs screen access to read a chat. Choose “Start now” when the prompt appears.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start Live mode.");
    } finally {
      setStarting(false);
    }
  };

  const stop = () => {
    RizzOverlay.stop();
    setRunning(false);
  };

  return <Screen footer={supported ? (
    running ? <Button title="Stop Live mode" icon="stop-circle-outline" variant="secondary" onPress={stop} /> :
      <Button title={!overlayOk ? "Allow floating bubble" : pendingChat ? `Start & open ${pendingChat.name}` : "Start Live mode"} icon={!overlayOk ? "settings-outline" : "radio-button-on"} loading={starting} onPress={() => void start()} />
  ) : <Button title="Use screenshot instead" icon="images-outline" onPress={() => router.replace("/")} />}>
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" color={colors.text} size={25} />
      </Pressable>
      <T v="caption" color={colors.textDim} style={styles.topLabel}>LIVE MODE</T>
      <View style={styles.topDot} />
    </View>

    <T style={styles.title}>Your wingman,{"\n"}<T style={styles.titleLime}>everywhere.</T></T>
    <T v="body" color={colors.textDim} style={styles.intro}>Reply ideas while you’re in the conversation.</T>

    <View style={styles.preview} accessibilityLabel="Preview of the Live mode floating bubble over a chat">
      <T v="caption" color={colors.textMute}>HOW IT LOOKS</T>
      <View style={styles.theirBubble}><T v="bodyStrong">you free tonight? 👀</T></View>
      <View style={styles.previewBottom}>
        <View style={styles.typingBubble}><T style={styles.typingText}>•••</T></View>
        <View style={styles.rBubble}><T style={styles.rText}>R</T></View>
      </View>
    </View>

    <View style={styles.status}>
      <View style={[styles.statusDot, running && { backgroundColor: colors.pink }]} />
      <T v="caption" color={running ? colors.pink : overlayOk ? colors.lime : colors.textDim}>
        {running ? "LIVE MODE IS ON" : overlayOk ? "READY TO START" : supported ? "ONE QUICK SETUP" : "ANDROID ONLY"}
      </T>
    </View>

    {pendingChat && supported ? <View style={styles.pending}>
      <Ionicons name="chatbubble-ellipses" color={colors.pink} size={21} />
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{pendingChat.name} is waiting</T>
        <T v="small" color={colors.textDim}>Start Live mode to read this {pendingChat.platform} chat.</T>
      </View>
    </View> : null}

    {supported ? <View style={styles.setup}>
      <Pressable accessibilityRole="button" onPress={() => RizzOverlay.openOverlaySettings()} style={styles.setupRow}>
        <View style={styles.setupIcon}><Ionicons name="chatbubble-outline" size={25} color={colors.text} /></View>
        <View style={{ flex: 1 }}>
          <T v="headline">Floating bubble</T>
          <T v="small" color={colors.textDim}>Shows Rizz AI over your chats</T>
        </View>
        <Ionicons name={overlayOk ? "checkmark-circle" : "chevron-forward"} size={25} color={overlayOk ? colors.lime : colors.textDim} />
      </Pressable>
      <View style={styles.divider} />
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: running || starting }} onPress={() => { if (!running && !starting) void start(); }} style={styles.setupRow}>
        <View style={styles.setupIcon}><Ionicons name="lock-closed-outline" size={25} color={colors.text} /></View>
        <View style={{ flex: 1 }}>
          <T v="headline">Screen access</T>
          <T v="small" color={colors.textDim}>{running ? "Active until you stop Live mode" : "Android asks when you tap Start"}</T>
        </View>
        <Ionicons name={running ? "checkmark-circle" : "chevron-forward"} size={25} color={running ? colors.lime : colors.textDim} />
      </Pressable>
    </View> : null}

    {supported ? <T v="body" color={colors.textDim} style={styles.hint}>Tap <T color={colors.lime}>R</T> for replies. Hold it to read the full chat.</T> : null}
    {error ? <Notice text={error} /> : null}
    {!supported ? <Notice tone="info" text="Live mode works on Android. You can still get replies by adding a screenshot in Chat Help." /> : null}

    <View style={styles.more}>
      <T v="caption" color={colors.textMute} style={{ marginBottom: space(3) }}>YOUR LIVE TOOLKIT</T>
      <Feature icon="chatbubbles-outline" title="Replies on the spot" body="Tap the bubble in a chat to get lines you can copy." color={colors.lime} />
      <Feature icon="albums-outline" title="The whole story" body="Hold the bubble, scroll up, and tap Done to use older messages too." color={colors.pink} />
      <Feature icon="bulb-outline" title="Coach in your corner" body="Ask what to say next, based on the chat you read." color={colors.lime} />
    </View>
    <View style={styles.privacy}><Ionicons name="shield-checkmark-outline" size={19} color={colors.lime} /><T v="small" color={colors.textDim} style={{ flex: 1 }}>Chats you read stay on this phone for future context. Text is sent for AI help when you tap the bubble. Rizz AI never sends a message for you.</T></View>
  </Screen>;
}

function Feature({ icon, title, body, color }: { icon: "chatbubbles-outline" | "albums-outline" | "bulb-outline"; title: string; body: string; color: string }) {
  return <View style={styles.feature}>
    <View style={[styles.featureIcon, { backgroundColor: color }]}><Ionicons name={icon} size={20} color={colors.bg} /></View>
    <View style={{ flex: 1 }}><T v="bodyStrong">{title}</T><T v="small" color={colors.textDim} style={{ marginTop: 2 }}>{body}</T></View>
  </View>;
}

const styles = StyleSheet.create({
  topBar: { height: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space(7) },
  back: { width: 44, height: 44, alignItems: "flex-start", justifyContent: "center" },
  topLabel: { letterSpacing: 2.8 },
  topDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.pink, marginRight: 17 },
  title: { color: colors.text, fontFamily: font.extrabold, fontSize: 43, lineHeight: 47, letterSpacing: -1.8 },
  titleLime: { color: colors.lime, fontFamily: font.extrabold, fontSize: 43, lineHeight: 47, letterSpacing: -1.8 },
  intro: { marginTop: space(3), marginBottom: space(6) },
  preview: { borderRadius: radius.xl, borderWidth: 2, borderColor: colors.lime, backgroundColor: colors.bg, minHeight: 210, padding: space(5), justifyContent: "space-between" },
  theirBubble: { alignSelf: "flex-start", maxWidth: "80%", backgroundColor: colors.surface3, borderRadius: radius.lg, borderBottomLeftRadius: 4, paddingHorizontal: space(4), paddingVertical: space(3), marginTop: space(3) },
  previewBottom: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space(3) },
  typingBubble: { minWidth: 110, height: 53, borderRadius: 24, borderBottomRightRadius: 4, backgroundColor: colors.lime, alignItems: "center", justifyContent: "center" },
  typingText: { color: colors.bg, fontFamily: font.extrabold, fontSize: 24, letterSpacing: 4 },
  rBubble: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", backgroundColor: colors.lime, borderWidth: 4, borderColor: colors.bg },
  rText: { color: colors.bg, fontFamily: font.extrabold, fontSize: 31, fontStyle: "italic" },
  status: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: space(5), height: 38, marginVertical: space(5) },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.lime },
  pending: { flexDirection: "row", alignItems: "center", gap: space(3), backgroundColor: colors.surface, borderColor: colors.pink, borderWidth: 1, borderRadius: radius.lg, padding: space(4), marginBottom: space(4) },
  setup: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: space(5) },
  setupRow: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: space(3) },
  setupIcon: { width: 34, alignItems: "center" },
  divider: { height: 1, backgroundColor: colors.border },
  hint: { textAlign: "center", marginTop: space(5), marginBottom: space(7) },
  more: { gap: space(2), marginBottom: space(6) },
  feature: { flexDirection: "row", gap: space(3), alignItems: "center", borderRadius: radius.lg, padding: space(3), backgroundColor: colors.surface },
  featureIcon: { width: 39, height: 39, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  privacy: { flexDirection: "row", gap: space(3), alignItems: "flex-start", borderRadius: radius.lg, padding: space(4), borderWidth: 1, borderColor: colors.border },
});
