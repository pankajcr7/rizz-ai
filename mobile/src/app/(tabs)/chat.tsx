import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PRACTICE_PERSONAS, type PersonaId } from "@rizz/shared";
import { api, errorMessage, RizzApiError } from "../../api/client";
import { Sheet } from "../../components/Sheet";
import { toast } from "../../components/Toast";
import { Button, ChipRow, IconButton, Notice, Section, Segmented, T } from "../../components/ui";
import { LANGUAGES } from "../../components/Vibe";
import { useApp, type ChatItem, type ChatMode } from "../../store";
import { readBase64, recordingMime, speak, stopSpeaking } from "../../lib/voice";
import { useProgress } from "../../store/progress";
import { useShare } from "../../store/share";
import { colors, font, GUTTER, gradient, radius, space } from "../../theme";

const PERSONA_OPTIONS = (Object.keys(PRACTICE_PERSONAS) as PersonaId[]).map((id) => ({
  id,
  label: `${PRACTICE_PERSONAS[id].emoji} ${PRACTICE_PERSONAS[id].label}`,
}));

const STARTERS: Record<ChatMode, string[]> = {
  coach: ["She left me on read 😭", "How do I ask her out?", "Is she into me?", "Usne reply nahi kiya, kya karun?"],
  practice: ["hey! love your dog pic 🐶", "ok important question: pineapple on pizza?", "hii kaise ho? 😊"],
};

const scoreColor = (s: number) => (s >= 7 ? colors.success : s >= 4 ? colors.warn : colors.danger);

export default function ChatScreen() {
  const { chats, setChat, persona, setPersona, prefs, setPrefs, chatMode: mode, setChatMode: setMode, features } = useApp();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  // Replies are spoken aloud after you talk (and in Practice if you turn it on).
  const [speakReplies, setSpeakReplies] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openFeedback, setOpenFeedback] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);
  const items = chats[mode];

  const toEnd = () => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 60);
  }, [mode]);

  const scored = items.filter((m) => m.feedback);
  const scores = scored.map((m) => m.feedback!.score);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const openShare = useShare((s) => s.open);
  const sharePractice = () => {
    if (avg === null) return;
    const best = [...scored].sort((a, b) => b.feedback!.score - a.feedback!.score)[0]?.content;
    openShare({ kind: "practice", avg, messages: scores.length, persona: PRACTICE_PERSONAS[persona].label, best });
    router.push("/share");
  };

  const startRecording = async () => {
    setError(undefined);
    stopSpeaking();
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return setError("Allow microphone access to use voice.");
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch {
      setError("Couldn't start the microphone.");
    }
  };

  const stopRecording = async () => {
    setRecording(false);
    setTranscribing(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("no recording");
      const data = await readBase64(uri);
      // < ~6 KB of audio is a tap, not a sentence.
      if (data.length < 8000) {
        setError("Didn't catch that — hold on a bit longer.");
        return;
      }
      const { text } = await api.transcribe({ mimeType: recordingMime, data, language: prefs.language });
      if (!text.trim()) {
        setError("Didn't catch that — try again closer to the mic.");
        return;
      }
      setSpeakReplies(true);
      await send(text, true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTranscribing(false);
    }
  };

  const send = async (text: string, spoken = false) => {
    const content = text.trim();
    if (!content || sending) return;
    setError(undefined);
    setInput("");
    const next: ChatItem[] = [...items, { role: "user", content }];
    setChat(mode, next);
    setSending(true);
    toEnd();
    try {
      const res = await api.chat({ mode, persona, prefs, turns: next.slice(-20).map(({ role, content: c }) => ({ role, content: c })) });
      const withFeedback = res.feedback ? next.map((m, i) => (i === next.length - 1 ? { ...m, feedback: res.feedback! } : m)) : next;
      setChat(mode, [...withFeedback, { role: "assistant", content: res.reply }]);
      if (spoken || speakReplies) speak(res.reply, prefs.language);
      if (res.feedback) setOpenFeedback(next.length - 1);
      if (mode === "practice" && res.feedback) useProgress.getState().award("practice", { score: res.feedback.score, persona });
      else useProgress.getState().award("chat");
      if (res.safety.flag !== "none" && res.safety.message) setError(res.safety.message);
    } catch (e) {
      setChat(mode, items);
      setInput(content);
      if (e instanceof RizzApiError && e.code === "quota_exceeded") router.push("/paywall");
      setError(errorMessage(e));
    } finally {
      setSending(false);
      toEnd();
    }
  };

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast("Copied");
  };

  const p = PRACTICE_PERSONAS[persona];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={70}>
        {/* Header */}
        <View style={styles.header}>
          <Segmented
            options={[
              { id: "coach" as ChatMode, label: "Wingman", icon: "sparkles-outline" },
              { id: "practice" as ChatMode, label: "Practice", icon: "game-controller-outline" },
            ]}
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(undefined);
            }}
            style={{ flex: 1 }}
          />
          {features.voice ? (
            <IconButton
              name={speakReplies ? "volume-high" : "volume-mute-outline"}
              label={speakReplies ? "Stop reading replies aloud" : "Read replies aloud"}
              color={speakReplies ? colors.pink : colors.textDim}
              onPress={() => {
                if (speakReplies) stopSpeaking();
                setSpeakReplies(!speakReplies);
              }}
              filled
            />
          ) : null}
          <IconButton name="options-outline" label="Chat settings" onPress={() => setSettingsOpen(true)} filled />
          {items.length ? <IconButton name={mode === "practice" ? "refresh" : "trash-outline"} label={mode === "practice" ? "New match" : "Clear chat"} onPress={() => setChat(mode, [])} filled /> : null}
        </View>

        {mode === "practice" ? (
          <Pressable onPress={() => setSettingsOpen(true)} style={styles.match}>
            <LinearGradient colors={gradient.brand} start={gradient.start} end={gradient.end} style={styles.avatar}>
              <T style={{ fontSize: 20 }}>{p.emoji}</T>
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">Your match · {p.label}</T>
              <T v="small" color={colors.textDim} numberOfLines={1}>
                {p.brief}
              </T>
            </View>
            {avg !== null ? (
              <Pressable onPress={sharePractice} accessibilityLabel={`Average score ${avg.toFixed(1)}. Tap to share.`} style={[styles.scorePill, { borderColor: scoreColor(avg), flexDirection: "row", alignItems: "center", gap: 4 }]}>
                <T v="small" color={scoreColor(avg)} style={{ fontFamily: font.bold }}>
                  avg {avg.toFixed(1)}
                </T>
                <Ionicons name="share-outline" size={13} color={scoreColor(avg)} />
              </Pressable>
            ) : null}
          </Pressable>
        ) : null}

        {/* Thread */}
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: space(3), paddingBottom: space(4) }} keyboardShouldPersistTaps="handled">
          {!items.length ? (
            <View style={{ alignItems: "center", paddingTop: space(8) }}>
              <LinearGradient colors={gradient.brandSoft} start={gradient.start} end={gradient.end} style={styles.heroIcon}>
                <Ionicons name={mode === "coach" ? "sparkles" : "game-controller"} size={30} color={colors.pink} />
              </LinearGradient>
              <T v="title" style={{ textAlign: "center" }}>
                {mode === "coach" ? "Your wingman" : "Practice mode"}
              </T>
              <T v="small" color={colors.textDim} style={{ textAlign: "center", marginTop: space(1.5), maxWidth: 300 }}>
                {mode === "coach"
                  ? "Ask anything — what to text, what they meant, how to ask them out."
                  : `Text a ${p.label.toLowerCase()} match. Every message gets a score and a better version.`}
              </T>
            </View>
          ) : null}

          {items.map((m, i) => {
            const mine = m.role === "user";
            return (
              <View key={i} style={{ marginBottom: space(2) }}>
                <Pressable onLongPress={() => copy(m.content)} accessibilityHint="Long-press to copy" style={[styles.bubble, mine ? styles.me : styles.them]}>
                  <T v="body" color={mine ? "#fff" : colors.text} selectable>
                    {m.content}
                  </T>
                </Pressable>
                {m.feedback ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <Pressable onPress={() => setOpenFeedback(openFeedback === i ? null : i)} style={[styles.badge, { borderColor: scoreColor(m.feedback.score) }]} accessibilityLabel={`Score ${m.feedback.score} out of 10. Tap for feedback.`}>
                      <T v="small" color={scoreColor(m.feedback.score)} style={{ fontFamily: font.bold, fontSize: 12 }}>
                        {m.feedback.score}/10
                      </T>
                      <Ionicons name={openFeedback === i ? "chevron-up" : "chevron-down"} size={12} color={scoreColor(m.feedback.score)} />
                    </Pressable>
                    {openFeedback === i ? (
                      <View style={styles.feedback}>
                        <T v="small" color={colors.textDim}>
                          {m.feedback.note}
                        </T>
                        <Pressable onPress={() => copy(m.feedback!.better)} style={styles.better}>
                          <Ionicons name="sparkles" size={14} color={colors.info} />
                          <T v="small" style={{ flex: 1 }}>
                            {m.feedback.better}
                          </T>
                          <Ionicons name="copy-outline" size={14} color={colors.textMute} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          {sending ? (
            <View style={[styles.bubble, styles.them, { flexDirection: "row", gap: 5, paddingVertical: space(3.5) }]}>
              <View style={styles.dot} />
              <View style={[styles.dot, { opacity: 0.6 }]} />
              <View style={[styles.dot, { opacity: 0.3 }]} />
            </View>
          ) : null}
          {error ? <Notice text={error} /> : null}
        </ScrollView>

        {/* Suggestions + composer */}
        {!items.length || (mode === "coach" && items.length < 2) ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space(2), paddingHorizontal: GUTTER, paddingBottom: space(3) }} keyboardShouldPersistTaps="handled">
            {STARTERS[mode].map((s) => (
              <Pressable key={s} onPress={() => send(s)} style={styles.suggestion}>
                <T v="small" style={{ fontFamily: font.semibold }}>
                  {s}
                </T>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={recording ? "Listening… tap ■ to send" : transcribing ? "Turning your voice into text…" : mode === "coach" ? "Ask your wingman…" : "Text your match…"}
            editable={!recording && !transcribing}
            placeholderTextColor={colors.textMute}
            selectionColor={colors.pink}
            style={styles.input}
            multiline
            numberOfLines={1}
            maxLength={2000}
            onKeyPress={(e) => {
              const ne = e.nativeEvent as { key: string; shiftKey?: boolean };
              if (Platform.OS === "web" && ne.key === "Enter" && !ne.shiftKey) {
                (e as unknown as { preventDefault?: () => void }).preventDefault?.();
                void send(input);
              }
            }}
          />
          {features.voice && !input.trim() ? (
            // Empty box → mic (tap to talk, tap again to send), like WhatsApp voice.
            <Pressable
              onPress={recording ? stopRecording : startRecording}
              disabled={sending || transcribing}
              accessibilityLabel={recording ? "Stop and send voice message" : "Talk instead of typing"}
              style={({ pressed }) => [pressed && { transform: [{ scale: 0.92 }] }, (sending || transcribing) && { opacity: 0.4 }]}
            >
              <View style={[styles.send, { backgroundColor: recording ? colors.danger : colors.surface2, borderWidth: recording ? 0 : 1, borderColor: colors.border }]}>
                <Ionicons name={recording ? "stop" : transcribing ? "hourglass-outline" : "mic"} size={20} color={recording ? "#fff" : colors.pink} />
              </View>
            </Pressable>
          ) : (
            <Pressable onPress={() => send(input)} disabled={!input.trim() || sending} accessibilityLabel="Send" style={({ pressed }) => [pressed && { transform: [{ scale: 0.92 }] }, (!input.trim() || sending) && { opacity: 0.35 }]}>
              <LinearGradient colors={gradient.brand} start={gradient.start} end={gradient.end} style={styles.send}>
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </LinearGradient>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Chat settings" footer={<Button title="Done" onPress={() => setSettingsOpen(false)} />}>
        <Section title="Language">
          <ChipRow options={LANGUAGES} value={prefs.language} onChange={(language) => setPrefs({ language })} wrap />
        </Section>
        <Section title="Practice match personality">
          <ChipRow
            options={PERSONA_OPTIONS}
            value={persona}
            onChange={(id) => {
              setPersona(id);
              if (mode === "practice" && items.length) setChat("practice", []); // new personality = new match
            }}
            wrap
          />
        </Section>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: space(2), paddingHorizontal: GUTTER, paddingTop: space(3), paddingBottom: space(2) },
  match: { flexDirection: "row", alignItems: "center", gap: space(3), marginHorizontal: GUTTER, marginTop: space(1), padding: space(3), borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  scorePill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
  heroIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: space(4) },
  bubble: { maxWidth: "84%", paddingHorizontal: space(3.5), paddingVertical: space(2.5), borderRadius: radius.lg },
  me: { alignSelf: "flex-end", backgroundColor: colors.meBubble, borderBottomRightRadius: 6 },
  them: { alignSelf: "flex-start", backgroundColor: colors.themBubble, borderBottomLeftRadius: 6 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: space(1.5), borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: 3 },
  feedback: { maxWidth: "84%", marginTop: space(2), padding: space(3), borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: space(2) },
  better: { flexDirection: "row", gap: space(2), alignItems: "flex-start", backgroundColor: colors.infoSoft, borderRadius: radius.sm, padding: space(2.5) },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.textDim },
  suggestion: { paddingHorizontal: space(3.5), paddingVertical: space(2.5), borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: space(2), paddingHorizontal: GUTTER, paddingVertical: space(3), borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.surface, color: colors.text, borderRadius: 22, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space(4), paddingTop: space(3), paddingBottom: space(3), fontSize: 15, fontFamily: font.medium, minHeight: 46, maxHeight: 120 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
