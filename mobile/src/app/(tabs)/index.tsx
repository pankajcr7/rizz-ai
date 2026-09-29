import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { parseChat, swapSides, type ToneId } from "@rizz/shared";
import { RizzOverlay } from "../../../modules/rizz-overlay";
import { BrandHeader } from "../../components/BrandHeader";
import { ChatPreview } from "../../components/ChatPreview";
import { CrushPicker } from "../../components/Crush";
import { toast } from "../../components/Toast";
import { Button, Card, Input, Notice, Screen, T } from "../../components/ui";
import { VibePills, VibeSheet } from "../../components/Vibe";
import { scanScreenshotToDraft } from "../../lib/scan";
import { useApp } from "../../store";
import { useCrushes } from "../../store/crushes";
import { useSession } from "../../store/session";
import { colors, font, radius, space } from "../../theme";

const TONES: { id: ToneId; label: string }[] = [
  { id: "flirty", label: "Flirty" }, { id: "funny", label: "Funny" },
  { id: "smooth", label: "Smooth" }, { id: "chill", label: "Unbothered" },
];

export default function ChatHelp() {
  const { draftChat, setDraftChat, setDraftMeta, replyDraft, setReplyDraft, platform, theirName, defaultTone, setDefaultTone, prefs, goal, history } = useApp();
  const crush = useCrushes((s) => s.crushes.find((c) => c.id === s.activeId));
  const run = useSession((s) => s.run);
  const [scanBusy, setScanBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [typed, setTyped] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [vibeOpen, setVibeOpen] = useState(false);
  const latest = history.find((h) => h.source !== "opener" && h.suggestions.length);

  const scan = async () => {
    setError(undefined);
    setScanBusy(true);
    const result = await scanScreenshotToDraft(platform);
    if (result.error) setError(result.error);
    setScanBusy(false);
  };
  const pasteChat = async () => {
    setPasteOpen(true);
    try {
      const value = await Clipboard.getStringAsync();
      if (value) { setPaste(value); const parsed = parseChat(value); setDraftChat(parsed.messages); setDraftMeta({ theirName: parsed.theirName }); }
    } catch { /* Manual paste stays available. */ }
  };
  const editPaste = (value: string) => {
    setPaste(value);
    const parsed = parseChat(value);
    setDraftChat(parsed.messages);
    setDraftMeta({ theirName: parsed.theirName });
  };
  const addManual = (from: "me" | "them") => {
    if (!typed.trim()) return;
    setDraftChat([...draftChat, { from, text: typed.trim() }]);
    setTyped("");
  };
  const generate = () => {
    void run({ kind: "reply", crushId: crush?.id, req: {
      platform: crush?.platform ?? platform, messages: draftChat, tone: defaultTone, goal,
      theirName: crush?.name ?? theirName, notes: crush?.notes || undefined,
      memory: crush?.facts.length ? crush.facts : undefined, draft: replyDraft.trim() || undefined, prefs,
    } });
    router.push("/results");
  };
  const lastTwo = draftChat.slice(-2);

  return <Screen>
    <BrandHeader />
    <View style={styles.chatFrame}>
      <View style={styles.frameTop}>
        <T v="caption" color={colors.lime}>{draftChat.length ? `${theirName || crush?.name || "YOUR CHAT"} · ${draftChat.length} MESSAGES` : "YOUR CHAT"}</T>
        {draftChat.length ? <Pressable onPress={() => setEditOpen(!editOpen)}><T v="small" color={colors.lime}>{editOpen ? "Done" : "Edit chat"}</T></Pressable> : null}
      </View>
      {draftChat.length ? (
        <>{lastTwo.map((m, i) => <View key={`${i}-${m.text}`} style={[styles.bubble, m.from === "me" ? styles.me : styles.them]}><T v="bodyStrong" color={colors.text}>{m.text}</T></View>)}
          <T v="small" color={colors.textMute} style={{ alignSelf: "flex-end", marginTop: space(2) }}>reading the room 👀</T></>
      ) : (
        <View style={styles.emptyFrame}><Ionicons name="chatbubble-ellipses-outline" size={34} color={colors.lime} /><T v="headline" style={{ marginTop: space(3) }}>Drop the chat here.</T><T v="small" color={colors.textDim} style={{ marginTop: space(1) }}>Screenshot, paste, or type what they said.</T></View>
      )}
    </View>
    {draftChat.length > 0 && editOpen ? <Card style={{ marginTop: space(3) }}><ChatPreview messages={draftChat} onChange={setDraftChat} /><View style={styles.editActions}><Button title="Swap sides" size="sm" variant="secondary" onPress={() => setDraftChat(swapSides(draftChat))} /><Button title="Clear" size="sm" variant="danger" onPress={() => { setDraftChat([]); setEditOpen(false); }} /></View></Card> : null}

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tones}>
      {TONES.map((tone) => <Pressable key={tone.id} onPress={() => setDefaultTone(tone.id)} style={[styles.tone, defaultTone === tone.id && styles.toneOn]}><T v="bodyStrong" color={defaultTone === tone.id ? colors.bg : colors.text}>{tone.label}</T></Pressable>)}
    </ScrollView>

    {latest ? <ReplyDeck lines={latest.suggestions.map((s) => s.text)} tone={latest.tone} /> : <View style={styles.deckEmpty}><T v="caption" color={colors.textMute}>THE GOOD PART</T><T style={styles.deckTitle}>Your next great reply goes here.</T><T v="small" color={colors.textDim}>Add a real chat and get three lines you can swipe through.</T></View>}

    <Button title={scanBusy ? "Reading screenshot…" : "＋  new screenshot"} loading={scanBusy} onPress={() => void scan()} style={{ marginTop: space(5) }} />
    {error ? <Notice text={error} /> : null}
    <View style={styles.quickActions}><Pressable onPress={() => void pasteChat()} style={styles.quick}><Ionicons name="clipboard-outline" size={19} color={colors.lime} /><T v="bodyStrong">Paste chat</T></Pressable><Pressable onPress={() => setEditOpen(true)} style={styles.quick}><Ionicons name="create-outline" size={19} color={colors.lime} /><T v="bodyStrong">Type it</T></Pressable></View>
    {pasteOpen ? <Input multiline value={paste} onChangeText={editPaste} placeholder={"Paste the chat…\nThem: what are you up to?\nMe: just got home"} style={{ marginBottom: space(4) }} /> : null}
    {editOpen ? <View style={{ gap: space(2), marginBottom: space(4) }}><Input value={typed} onChangeText={setTyped} placeholder="Add a message…" /><View style={{ flexDirection: "row", gap: space(2) }}><Button title="They said" size="sm" variant="secondary" onPress={() => addManual("them")} style={{ flex: 1 }} /><Button title="I said" size="sm" variant="secondary" onPress={() => addManual("me")} style={{ flex: 1 }} /></View></View> : null}
    {draftChat.length ? <><CrushPicker /><VibePills onOpen={() => setVibeOpen(true)} showGoal /><Input value={replyDraft} onChangeText={setReplyDraft} placeholder="Your rough reply (optional)…" style={{ marginTop: space(4) }} /><Button title="Generate replies ✨" onPress={generate} style={{ marginTop: space(4) }} /></> : null}
    {RizzOverlay.available ? <Pressable onPress={() => router.push("/live")} style={styles.live}><Ionicons name="radio-button-on" size={22} color={colors.pink} /><View style={{ flex: 1 }}><T v="bodyStrong">Use Live mode</T><T v="small" color={colors.textDim}>Get replies without leaving their app</T></View><Ionicons name="chevron-forward" size={18} color={colors.textDim} /></Pressable> : null}
    <VibeSheet open={vibeOpen} onClose={() => setVibeOpen(false)} showGoal />
  </Screen>;
}

function ReplyDeck({ lines, tone }: { lines: string[]; tone: ToneId }) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 40;
  const [active, setActive] = useState(0);
  const favorites = useApp((s) => s.favorites);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  return <View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + 12} decelerationRate="fast" onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12)))} contentContainerStyle={{ gap: 12, paddingRight: 20 }}>
      {lines.map((line, i) => <View key={`${i}-${line}`} style={[styles.deck, { width: cardWidth }]}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T v="caption" color={colors.textDim}>{i + 1} / {lines.length} · FOR YOU</T><Pressable accessibilityLabel="Save reply" onPress={() => toggleFavorite(line, tone)}><Ionicons name={favorites.some((f) => f.text === line) ? "heart" : "heart-outline"} color={favorites.some((f) => f.text === line) ? colors.pink : colors.textDim} size={25} /></Pressable></View>
        <T style={styles.deckTitle}>{line}</T>
        <Pressable onPress={async () => { await Clipboard.setStringAsync(line); toast("Copied — go send it 🔥"); }} style={styles.copy}><Ionicons name="copy-outline" size={22} color={colors.bg} /><T v="bodyStrong" color={colors.bg} style={{ fontFamily: font.extrabold, fontSize: 17 }}>Copy reply</T></Pressable>
      </View>)}
    </ScrollView>
    <View style={styles.dots}>{lines.map((_, i) => <View key={i} style={[styles.dot, active === i && { backgroundColor: colors.lime, width: 10, height: 10 }]} />)}</View>
  </View>;
}

const styles = StyleSheet.create({
  chatFrame: { borderWidth: 2, borderColor: colors.lime, borderRadius: radius.xl, minHeight: 195, padding: space(4), backgroundColor: colors.bg },
  frameTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space(3) },
  bubble: { borderRadius: 22, paddingHorizontal: space(4), paddingVertical: space(3), maxWidth: "82%", marginBottom: space(2) },
  them: { alignSelf: "flex-start", backgroundColor: colors.surface3, borderBottomLeftRadius: 5 },
  me: { alignSelf: "flex-end", backgroundColor: "#3984F7", borderBottomRightRadius: 5 },
  emptyFrame: { alignItems: "center", justifyContent: "center", flex: 1, minHeight: 130 },
  editActions: { flexDirection: "row", gap: space(2), marginTop: space(3) },
  tones: { gap: space(2), paddingVertical: space(5) },
  tone: { paddingHorizontal: space(5), minHeight: 52, justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  toneOn: { backgroundColor: colors.lime, borderColor: colors.lime },
  deck: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 2, borderColor: colors.border, padding: space(5), minHeight: 290, justifyContent: "space-between" },
  deckEmpty: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 2, borderColor: colors.border, padding: space(5), minHeight: 225, justifyContent: "space-between" },
  deckTitle: { color: colors.text, fontFamily: font.extrabold, fontSize: 33, lineHeight: 38, letterSpacing: -0.9, marginVertical: space(4) },
  copy: { backgroundColor: colors.pink, minHeight: 57, borderRadius: radius.pill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(3) },
  dots: { flexDirection: "row", justifyContent: "center", gap: space(3), paddingTop: space(4) },
  dot: { width: 8, height: 8, borderRadius: 5, backgroundColor: colors.borderStrong },
  quickActions: { flexDirection: "row", gap: space(3), marginVertical: space(4) },
  quick: { flex: 1, height: 54, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2) },
  live: { flexDirection: "row", alignItems: "center", gap: space(3), padding: space(4), marginTop: space(6), backgroundColor: colors.surface, borderRadius: radius.lg },
});
