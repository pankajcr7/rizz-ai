import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { liveStreak, parseChat, swapSides } from "@rizz/shared";
import { RizzOverlay } from "../../../modules/rizz-overlay";
import { ChatPreview } from "../../components/ChatPreview";
import { CrushPicker } from "../../components/Crush";
import { Button, Card, IconButton, Input, Notice, Screen, Segmented, T } from "../../components/ui";
import { VibePills, VibeSheet } from "../../components/Vibe";
import { pickScreenshot } from "../../lib/image";
import { scanScreenshotToDraft } from "../../lib/scan";
import { useApp } from "../../store";
import { useCrushes } from "../../store/crushes";
import { useOpenerDraft, useProfileDraft } from "../../store/drafts";
import { useProgress } from "../../store/progress";
import { useSession } from "../../store/session";
import { colors, font, radius, space } from "../../theme";

type Mode = "reply" | "opener" | "profile";

export default function Home() {
  const [mode, setMode] = useState<Mode>("reply");
  const [vibeOpen, setVibeOpen] = useState(false);

  return (
    <Screen footer={<Footer mode={mode} />}>
      <TopBar />
      <Segmented
        options={[
          { id: "reply" as Mode, label: "Reply", icon: "chatbubble-ellipses-outline" },
          { id: "opener" as Mode, label: "Opener", icon: "flash-outline" },
          { id: "profile" as Mode, label: "My profile", icon: "person-outline" },
        ]}
        value={mode}
        onChange={setMode}
        style={{ marginBottom: space(5) }}
      />
      {mode === "reply" ? <CrushPicker /> : null}
      {mode === "reply" ? <ReplyInput /> : mode === "opener" ? <OpenerInput /> : <ProfileInput />}
      {mode !== "profile" ? (
        <View style={{ marginTop: space(5) }}>
          <VibePills onOpen={() => setVibeOpen(true)} showGoal={mode === "reply"} />
        </View>
      ) : null}
      {RizzOverlay.available && mode === "reply" ? <AndroidBanners /> : null}
      <VibeSheet open={vibeOpen} onClose={() => setVibeOpen(false)} showGoal={mode === "reply"} />
    </Screen>
  );
}

function TopBar() {
  const quota = useApp((s) => s.quota);
  const streak = useProgress((s) => liveStreak(s.streak));
  const left = quota && quota.limit !== null ? Math.max(0, quota.limit - quota.used) : null;
  return (
    <View style={styles.topBar}>
      <View style={{ flex: 1 }}>
        <T v="caption" color={colors.text}>RIZZ</T>
        <T v="display" style={{ marginTop: space(3) }}>
          What did they say?
        </T>
        <T v="body" color={colors.textDim} style={{ marginTop: space(2) }}>
          Drop the chat. Keep your voice.
        </T>
      </View>
      <Pressable onPress={() => router.push("/progress")} style={[styles.credits, { marginRight: space(2) }]} accessibilityLabel={`${streak} day streak. Open progress.`}>
        <T style={{ fontSize: 14 }}>🔥</T>
        <T v="small" style={{ fontFamily: font.bold }}>
          {streak}
        </T>
      </Pressable>
      <Pressable onPress={() => router.push("/paywall")} style={styles.credits} accessibilityLabel={quota?.plan === "pro" ? "Pro plan" : `${left ?? ""} free replies left`}>
        <Ionicons name={quota?.plan === "pro" ? "diamond" : "sparkles"} size={14} color={colors.amber} />
        <T v="small" style={{ fontFamily: font.bold }}>
          {quota?.plan === "pro" ? "PRO" : left !== null ? `${left} left` : "Free"}
        </T>
      </Pressable>
    </View>
  );
}

function ReplyInput() {
  const { draftChat: messages, setDraftChat: setMessages, replyDraft, setReplyDraft, setDraftMeta, platform } = useApp();
  const [paste, setPaste] = useState(false);
  const [text, setText] = useState("");
  const [builder, setBuilder] = useState(false);
  const [draftOpen, setDraftOpen] = useState(!!replyDraft);
  const [typed, setTyped] = useState("");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string>();

  const scan = async () => {
    setError(undefined);
    setScanning(true);
    const r = await scanScreenshotToDraft(platform);
    setScanning(false);
    if (r.error) setError(r.error);
  };

  const onPaste = (t: string) => {
    setText(t);
    const parsed = parseChat(t);
    setMessages(parsed.messages);
    setDraftMeta({ theirName: parsed.theirName });
  };

  // Always open the paste box; prefill it only if we're allowed to read the clipboard.
  const fromClipboard = async () => {
    setPaste(true);
    try {
      const t = await Clipboard.getStringAsync();
      if (t) onPaste(t);
    } catch {
      // Permission denied / unsupported — the user can paste manually.
    }
  };

  const add = (from: "me" | "them") => {
    if (!typed.trim()) return;
    setMessages([...messages, { from, text: typed.trim() }]);
    setTyped("");
  };

  const clear = () => {
    setMessages([]);
    setReplyDraft("");
    setText("");
    setPaste(false);
    setBuilder(false);
    setDraftMeta({ theirName: undefined });
  };

  if (messages.length && !paste) {
    return (
      <Card style={{ padding: space(3) }}>
        <View style={styles.previewHead}>
          <T v="caption" color={colors.textMute}>
            The chat · {messages.length} messages
          </T>
          <View style={{ flexDirection: "row" }}>
            <IconButton name="add-circle-outline" label="Add a message" onPress={() => setBuilder(!builder)} size={20} />
            <IconButton name="swap-horizontal" label="Swap sides" onPress={() => setMessages(swapSides(messages))} size={20} />
            <IconButton name="trash-outline" label="Clear chat" onPress={clear} size={19} />
          </View>
        </View>
        <ChatPreview messages={messages} onChange={setMessages} />
        {builder ? <Builder value={typed} onChange={setTyped} onAdd={add} /> : null}
        <T v="small" color={colors.textMute} style={{ textAlign: "center", marginTop: space(2), fontSize: 12 }}>
          Tap a bubble to switch sides · hold to remove
        </T>
        <DraftPolish open={draftOpen} setOpen={setDraftOpen} value={replyDraft} onChange={setReplyDraft} />
      </Card>
    );
  }

  return (
    <View>
      {error ? <Notice text={error} /> : null}
      <Pressable onPress={scan} disabled={scanning} style={({ pressed }) => [styles.drop, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel="Upload a chat screenshot">
        <T v="caption" color={colors.textMute}>NEW REPLY</T>
        <T v="title" style={{ marginTop: space(2) }}>{scanning ? "Reading the screenshot…" : "Start with the conversation"}</T>
        <T v="body" color={colors.textDim} style={{ marginTop: space(2) }}>
          Screenshot, paste, or type a few messages.
        </T>
        <View style={styles.dropAction}>
          <Ionicons name={scanning ? "hourglass-outline" : "image-outline"} size={19} color={colors.bg} />
          <T v="bodyStrong" color={colors.bg}>{scanning ? "Reading…" : "Add screenshot"}</T>
        </View>
      </Pressable>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <T v="small" color={colors.textMute}>
          or
        </T>
        <View style={styles.orLine} />
      </View>

      {paste ? (
        <View>
          <Input
            multiline
            autoFocus
            value={text}
            onChangeText={onPaste}
            placeholder={"Paste the chat, e.g.\nHer: what are you up to this weekend?\nMe: plotting world domination"}
          />
          {messages.length ? <Button title={`Looks good · ${messages.length} messages`} variant="secondary" size="md" icon="checkmark" onPress={() => setPaste(false)} style={{ marginTop: space(2) }} /> : null}
        </View>
      ) : builder ? (
        <Builder value={typed} onChange={setTyped} onAdd={add} />
      ) : (
        <View style={{ flexDirection: "row", gap: space(3) }}>
          <Button title="Paste chat" icon="clipboard-outline" variant="secondary" size="md" onPress={fromClipboard} style={{ flex: 1 }} />
          <Button title="Type it" icon="create-outline" variant="secondary" size="md" onPress={() => setBuilder(true)} style={{ flex: 1 }} />
        </View>
      )}
      <DraftPolish open={draftOpen} setOpen={setDraftOpen} value={replyDraft} onChange={setReplyDraft} />
    </View>
  );
}

function DraftPolish({ open, setOpen, value, onChange }: { open: boolean; setOpen: (v: boolean) => void; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ marginTop: space(4) }}>
      <Pressable onPress={() => setOpen(!open)} style={styles.draftToggle} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">Already know what you want to say?</T>
          <T v="small" color={colors.textDim}>Write it roughly. Rizz AI will clean it up without changing your meaning.</T>
        </View>
        <Ionicons name={open ? "chevron-up" : "create-outline"} size={20} color={colors.pink} />
      </Pressable>
      {open ? (
        <Input
          multiline
          value={value}
          onChangeText={onChange}
          placeholder="e.g. can't do Friday, maybe Sunday afternoon?"
          maxLength={1000}
          style={{ minHeight: 86, marginTop: space(2) }}
        />
      ) : null}
    </View>
  );
}

function Builder({ value, onChange, onAdd }: { value: string; onChange: (t: string) => void; onAdd: (from: "me" | "them") => void }) {
  return (
    <View style={{ marginTop: space(2) }}>
      <Input value={value} onChangeText={onChange} placeholder="Type a message from the chat…" onSubmitEditing={() => onAdd("them")} />
      <View style={{ flexDirection: "row", gap: space(2), marginTop: space(2) }}>
        <Button title="They said" variant="secondary" size="sm" onPress={() => onAdd("them")} style={{ flex: 1 }} />
        <Button title="I said" variant="secondary" size="sm" onPress={() => onAdd("me")} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function OpenerInput() {
  const { openerImage: image, setOpenerImage: setImage, openerBio: bio, setOpenerBio: setBio } = useOpenerDraft();
  return (
    <View>
      <Pressable onPress={async () => setImage(await pickScreenshot())} style={({ pressed }) => [styles.drop, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        {image ? (
          <View style={{ alignItems: "center" }}>
            <Image source={{ uri: `data:${image.mediaType};base64,${image.data}` }} style={styles.profileImg} />
            <T v="small" color={colors.pink} style={{ fontFamily: font.bold, marginTop: space(2) }} onPress={() => setImage(null)}>
              Remove
            </T>
          </View>
        ) : (
          <>
            <View style={styles.dropIcon}>
              <Ionicons name="person-circle-outline" size={28} color={colors.pink} />
            </View>
            <T v="headline">Add their profile</T>
            <T v="small" color={colors.textDim} style={{ marginTop: 2 }}>
              Screenshot of their photos or prompts
            </T>
          </>
        )}
      </Pressable>
      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <T v="small" color={colors.textMute}>
          and / or
        </T>
        <View style={styles.orLine} />
      </View>
      <Input multiline value={bio} onChangeText={setBio} placeholder="Paste their bio or prompts…" maxLength={2000} style={{ minHeight: 90 }} />
    </View>
  );
}

const MAX_PHOTOS = 3;

function ProfileInput() {
  const { images, setImages, bio, setBio, roast, setRoast } = useProfileDraft();
  return (
    <View>
      <T v="small" color={colors.textDim} style={{ marginBottom: space(3) }}>
        Add up to 3 of your own profile photos (or screenshots) and your bio. Get a score, photo-by-photo tips and a better bio.
      </T>
      <View style={{ flexDirection: "row", gap: space(3), marginBottom: space(4) }}>
        {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
          const img = images[i];
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={img ? `Photo ${i + 1}, tap to remove` : "Add a photo"}
              onPress={async () => {
                if (img) return setImages(images.filter((_, j) => j !== i));
                const picked = await pickScreenshot();
                if (picked) setImages([...images, picked].slice(0, MAX_PHOTOS));
              }}
              style={[styles.photoSlot, img && { borderStyle: "solid", borderColor: colors.border }]}
            >
              {img ? (
                <>
                  <Image source={{ uri: `data:${img.mediaType};base64,${img.data}` }} style={StyleSheet.absoluteFill} />
                  <View style={styles.photoRemove}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </View>
                </>
              ) : images.length === i ? (
                <Ionicons name="add" size={26} color={colors.pink} />
              ) : (
                <Ionicons name="image-outline" size={20} color={colors.textMute} />
              )}
            </Pressable>
          );
        })}
      </View>
      <Input multiline value={bio} onChangeText={setBio} placeholder="Paste your bio / prompts (optional)…" maxLength={2000} style={{ minHeight: 90 }} />
      <Pressable onPress={() => setRoast(!roast)} accessibilityRole="switch" accessibilityState={{ checked: roast }} style={styles.roastRow}>
        <T style={{ fontSize: 22 }}>🔥</T>
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">Roast me too</T>
          <T v="small" color={colors.textDim}>
            A playful roast on top of the honest review
          </T>
        </View>
        <Ionicons name={roast ? "checkbox" : "square-outline"} size={24} color={roast ? colors.pink : colors.textMute} />
      </Pressable>
    </View>
  );
}

function Footer({ mode }: { mode: Mode }) {
  const { draftChat, replyDraft, defaultTone, goal, platform, theirName, prefs } = useApp();
  const { openerImage, openerBio } = useOpenerDraft();
  const profile = useProfileDraft();
  const run = useSession((s) => s.run);
  const crush = useCrushes((s) => s.crushes.find((c) => c.id === s.activeId));
  const ready =
    mode === "reply" ? draftChat.length > 0 || !!replyDraft.trim() : mode === "opener" ? !!openerImage || !!openerBio.trim() : profile.images.length > 0 || !!profile.bio.trim();

  const go = () => {
    if (mode === "reply") {
      void run({
        kind: "reply",
        crushId: crush?.id,
        req: {
          platform: crush?.platform ?? platform,
          messages: draftChat,
          tone: defaultTone,
          goal,
          theirName: crush?.name ?? theirName,
          notes: crush?.notes || undefined,
          memory: crush?.facts.length ? crush.facts : undefined,
          draft: replyDraft.trim() || undefined,
          prefs,
        },
      });
    } else if (mode === "profile") {
      void run({ kind: "profile", req: { platform, images: profile.images, bio: profile.bio.trim() || undefined, roast: profile.roast, prefs } });
    } else {
      void run({ kind: "opener", req: { platform, tone: defaultTone, bio: openerBio.trim() || undefined, image: openerImage ?? undefined, prefs } });
    }
    router.push("/results");
  };

  return (
    <Button
      title={mode === "reply" ? (replyDraft.trim() && !draftChat.length ? "Polish my message" : "Get replies") : mode === "opener" ? "Write openers" : "Review my profile"}
      icon="sparkles"
      disabled={!ready}
      onPress={go}
    />
  );
}

function AndroidBanners() {
  // Once the keyboard is set up, promote Live mode instead.
  const keyboardReady = RizzOverlay.keyboard.isSelected();
  return keyboardReady ? (
    <Banner icon="radio-button-on" title="Reply without leaving the chat" body="Live mode — a ✨ bubble over Instagram & co." to="/live" />
  ) : (
    <Banner icon="keypad" title="Get the Rizz Keyboard" body="Replies inside Instagram, WhatsApp & Tinder — right where you type." to="/keyboard" />
  );
}

function Banner({ icon, title, body, to }: { icon: "keypad" | "radio-button-on"; title: string; body: string; to: "/live" | "/keyboard" }) {
  return (
    <Card onPress={() => router.push(to)} style={styles.live}>
      <View style={[styles.dropIcon, { width: 44, height: 44, marginBottom: 0 }]}>
        <Ionicons name={icon} size={20} color={colors.pink} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{title}</T>
        <T v="small" color={colors.textDim}>
          {body}
        </T>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMute} />
    </Card>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "flex-start", gap: space(3), paddingTop: space(2), marginBottom: space(5) },
  credits: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space(3), height: 34, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, marginTop: 4 },
  drop: { alignItems: "flex-start", justifyContent: "center", padding: space(6), minHeight: 250, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dropAction: { flexDirection: "row", alignItems: "center", gap: space(2), marginTop: space(6), paddingHorizontal: space(4), height: 48, borderRadius: radius.pill, backgroundColor: colors.accent },
  dropIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", marginBottom: space(3) },
  orRow: { flexDirection: "row", alignItems: "center", gap: space(3), marginVertical: space(4) },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  previewHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space(2), paddingLeft: space(1) },
  profileImg: { width: 120, height: 200, borderRadius: radius.md },
  photoSlot: { flex: 1, aspectRatio: 3 / 4, borderRadius: radius.md, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.borderStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  photoRemove: { position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  roastRow: { flexDirection: "row", alignItems: "center", gap: space(3), marginTop: space(4), padding: space(4), borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  live: { flexDirection: "row", alignItems: "center", gap: space(3), marginTop: space(5) },
  draftToggle: { flexDirection: "row", alignItems: "center", gap: space(3), padding: space(3), borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
});
