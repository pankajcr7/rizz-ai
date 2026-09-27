import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, Share as RNShare, StyleSheet, Switch, View } from "react-native";
import { levelFor, liveStreak, TONES, type Preferences } from "@rizz/shared";
import { useCrushes } from "../../store/crushes";
import { useProgress } from "../../store/progress";
import { RizzOverlay } from "../../../modules/rizz-overlay";
import * as Clipboard from "expo-clipboard";
import { api, errorMessage } from "../../api/client";
import { toast } from "../../components/Toast";
import { inviteText } from "../../lib/invite";
import { Sheet } from "../../components/Sheet";
import { ToneStrip } from "../../components/ToneStrip";
import { Button, Card, ChipRow, GradientBorder, Header, Input, ListGroup, ListRow, Notice, Screen, Section, T } from "../../components/ui";
import { boldLabel, LANGUAGES } from "../../components/Vibe";
import { secureStorage } from "../../lib/secureStorage";
import { useApp } from "../../store";
import { colors, font, space } from "../../theme";

type SheetId = "tone" | "language" | "boldness" | "length" | "emoji" | "about" | "redeem" | null;

const LENGTHS: { id: Preferences["length"]; label: string }[] = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
];
const EMOJIS = [
  { id: "0", label: "None" },
  { id: "1", label: "A few 🙂" },
  { id: "2", label: "Lots 😍🔥" },
] as const;

export default function Me() {
  const { prefs, setPrefs, defaultTone, setDefaultTone, saveHistory, setSaveHistory, quota, referral, setReferral, refreshMe, resetAll } = useApp();
  const [sheet, setSheet] = useState<SheetId>(null);
  const [about, setAbout] = useState(prefs.aboutMe ?? "");
  const pro = quota?.plan === "pro";
  const progress = useProgress();
  const level = levelFor(progress.xp);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string>();
  const redeem = async () => {
    setRedeemError(undefined);
    setRedeeming(true);
    try {
      const r = await api.redeem(code.trim().toUpperCase());
      setReferral(r.referral);
      await refreshMe();
      setSheet(null);
      setCode("");
      toast(`🎉 ${r.rewardDays} days of Pro unlocked`);
    } catch (e) {
      setRedeemError(errorMessage(e));
    } finally {
      setRedeeming(false);
    }
  };

  const shareInvite = async () => {
    const text = inviteText(referral?.code);
    try {
      if (Platform.OS === "web") {
        const nav = globalThis.navigator as Navigator;
        if (nav.share) await nav.share({ text });
        else {
          await Clipboard.setStringAsync(text);
          toast("Invite copied — paste it anywhere");
        }
      } else {
        await RNShare.share({ message: text });
      }
    } catch {
      // cancelled
    }
  };

  const confirmDelete = () => {
    const run = async () => {
      await secureStorage.remove("rizz.token");
      resetAll();
      useCrushes.setState({ crushes: [], activeId: null });
      useProgress.getState().reset();
      router.replace("/onboarding");
    };
    // Alert with buttons isn't supported on web.
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Delete all your saved replies, history, crush profiles, progress and settings from this device?")) void run();
      return;
    }
    Alert.alert("Delete all data?", "Removes your saved replies, history, crush profiles, progress and settings from this phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run() },
    ]);
  };

  const close = () => setSheet(null);
  const lang = LANGUAGES.find((l) => l.id === prefs.language)?.label ?? prefs.language;

  return (
    <Screen>
      <Header title="You" subtitle="Your edge, in one place." />

      {/* Plan */}
      {pro ? (
        <GradientBorder style={{ marginBottom: space(6) }}>
          <View style={{ padding: space(4), flexDirection: "row", alignItems: "center", gap: space(3) }}>
            <Ionicons name="diamond" size={24} color={colors.amber} />
            <View style={{ flex: 1 }}>
              <T v="headline">Rizz AI Pro</T>
              <T v="small" color={colors.textDim}>
                Unlimited everything. Go get ’em.
              </T>
            </View>
          </View>
        </GradientBorder>
      ) : (
        <Card style={{ marginBottom: space(6) }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
            <View style={{ flex: 1 }}>
              <T v="headline">Free plan</T>
              <T v="small" color={colors.textDim}>
                {quota && quota.limit !== null ? `${quota.used} of ${quota.limit} replies used today` : "10 replies a day"}
              </T>
            </View>
            <Button title="Upgrade" icon="diamond" size="sm" onPress={() => router.push("/paywall")} />
          </View>
          {quota && quota.limit !== null ? (
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface3, marginTop: space(4), overflow: "hidden" }}>
              <View style={{ height: 6, width: `${Math.min(100, (quota.used / quota.limit) * 100)}%`, backgroundColor: colors.pink }} />
            </View>
          ) : null}
        </Card>
      )}

      {/* Level */}
      <Card onPress={() => router.push("/progress")} style={{ marginBottom: space(6), flexDirection: "row", alignItems: "center", gap: space(3) }}>
        <T style={{ fontSize: 34 }}>{level.emoji}</T>
        <View style={{ flex: 1 }}>
          <T v="headline">{level.title}</T>
          <T v="small" color={colors.textDim}>
            {progress.xp} XP · 🔥 {liveStreak(progress.streak)}-day streak
          </T>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface3, marginTop: space(2), overflow: "hidden" }}>
            <View style={{ height: 6, width: `${Math.max(4, level.progress * 100)}%`, backgroundColor: colors.pink }} />
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMute} />
      </Card>

      {/* Invite */}
      <Section title="Invite friends">
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
            <T style={{ fontSize: 30 }}>🎁</T>
            <View style={{ flex: 1 }}>
              <T v="headline">Give 7 days, get 7 days</T>
              <T v="small" color={colors.textDim}>
                Friends who use your code get Pro for a week — and so do you.
              </T>
            </View>
          </View>
          <View style={styles.codeRow}>
            <View style={{ flex: 1 }}>
              <T v="caption" color={colors.textMute}>
                Your code
              </T>
              <T v="title" style={{ letterSpacing: 3, marginTop: 2 }} selectable>
                {referral?.code ?? "······"}
              </T>
            </View>
            <Button
              title="Copy"
              icon="copy-outline"
              variant="secondary"
              size="sm"
              disabled={!referral}
              onPress={async () => {
                await Clipboard.setStringAsync(referral?.code ?? "");
                toast("Code copied");
              }}
            />
          </View>
          <Button title="Share invite" icon="share-social" size="md" disabled={!referral} onPress={shareInvite} style={{ marginTop: space(3) }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space(3) }}>
            <T v="small" color={colors.textDim}>
              {referral?.invites ? `${referral.invites} friend${referral.invites === 1 ? "" : "s"} joined 🙌` : "No invites yet"}
            </T>
            {referral?.proUntil ? (
              <T v="small" color={colors.amber} style={{ fontFamily: font.bold }}>
                Pro until {new Date(referral.proUntil).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </T>
            ) : null}
          </View>
        </Card>
        {!referral?.redeemed ? (
          <View style={{ marginTop: space(3) }}>
            <ListGroup>
              <ListRow icon="ticket-outline" title="Have an invite code?" onPress={() => setSheet("redeem")} last />
            </ListGroup>
          </View>
        ) : null}
      </Section>

      <Section title="Preferences">
        <ListGroup>
          <ListRow icon="happy-outline" title="Default tone" value={`${TONES[defaultTone].emoji} ${TONES[defaultTone].label}`} onPress={() => setSheet("tone")} />
          <ListRow icon="language-outline" title="Language" value={lang} onPress={() => setSheet("language")} />
          <ListRow icon="flame-outline" title="Boldness" value={`${boldLabel(prefs.boldness)} (${prefs.boldness}/5)`} onPress={() => setSheet("boldness")} />
          <ListRow icon="resize-outline" title="Reply length" value={LENGTHS.find((l) => l.id === prefs.length)?.label} onPress={() => setSheet("length")} />
          <ListRow icon="happy" title="Emojis" value={EMOJIS[prefs.emoji]?.label} onPress={() => setSheet("emoji")} />
          <ListRow icon="person-outline" title="About me" value={prefs.aboutMe || "Not set"} onPress={() => setSheet("about")} last />
        </ListGroup>
      </Section>

      {RizzOverlay.available ? (
        <Section title="Live tools">
          <ListGroup>
            <ListRow icon="keypad-outline" title="Rizz Keyboard" value={RizzOverlay.keyboard.isSelected() ? "On" : RizzOverlay.keyboard.isEnabled() ? "Enabled" : "Set up"} onPress={() => router.push("/keyboard")} />
            <ListRow icon="notifications-outline" title="Smart notifications" value={RizzOverlay.smart.hasAccess() ? "On" : "Set up"} onPress={() => router.push("/notifications")} />
            <ListRow icon="radio-button-on-outline" title="Live bubble" value={RizzOverlay.isRunning() ? "On" : "Off"} onPress={() => router.push("/live")} last />
          </ListGroup>
        </Section>
      ) : null}

      <Section title="Privacy">
        <ListGroup>
          <ListRow
            icon="time-outline"
            title="Keep history"
            right={<Switch value={saveHistory} onValueChange={setSaveHistory} trackColor={{ true: colors.pink, false: colors.surface3 }} thumbColor="#fff" {...({ activeThumbColor: "#fff" } as object)} />}
          />
          <ListRow icon="trash-outline" title="Delete all my data" danger onPress={confirmDelete} last />
        </ListGroup>
      </Section>

      <T v="small" color={colors.textMute} style={{ textAlign: "center" }}>
        {PRIVACY}
      </T>
      <T v="small" color={colors.textMute} style={{ textAlign: "center", marginTop: space(3) }}>
        Rizz AI {Constants.expoConfig?.version ?? ""} · 18+ only
      </T>

      {/* Sheets */}
      <Sheet open={sheet === "tone"} onClose={close} title="Default tone" footer={<Button title="Done" onPress={close} />}>
        <ToneStrip value={defaultTone} onChange={setDefaultTone} />
        <View style={{ height: space(4) }} />
      </Sheet>
      <Sheet open={sheet === "language"} onClose={close} title="Language" footer={<Button title="Done" onPress={close} />}>
        <ChipRow options={LANGUAGES} value={prefs.language} onChange={(language) => setPrefs({ language })} wrap />
        <T v="small" color={colors.textMute} style={{ marginTop: space(4) }}>
          Hinglish, Tanglish, Tenglish, Kanglish, Manglish, Benglish & Punglish = Roman-script Indian languages mixed with English, the way people actually text on Insta & WhatsApp.
        </T>
      </Sheet>
      <Sheet open={sheet === "boldness"} onClose={close} title="Boldness" footer={<Button title="Done" onPress={close} />}>
        <ChipRow options={[1, 2, 3, 4, 5].map((n) => ({ id: String(n), label: `${"🌶".repeat(n)} ${boldLabel(n)}` }))} value={String(prefs.boldness)} onChange={(v) => setPrefs({ boldness: Number(v) })} wrap />
      </Sheet>
      <Sheet open={sheet === "length"} onClose={close} title="Reply length" footer={<Button title="Done" onPress={close} />}>
        <ChipRow options={LENGTHS} value={prefs.length} onChange={(length) => setPrefs({ length })} wrap />
      </Sheet>
      <Sheet open={sheet === "emoji"} onClose={close} title="Emojis" footer={<Button title="Done" onPress={close} />}>
        <ChipRow options={[...EMOJIS]} value={String(prefs.emoji) as "0" | "1" | "2"} onChange={(v) => setPrefs({ emoji: Number(v) })} wrap />
      </Sheet>
      <Sheet
        open={sheet === "redeem"}
        onClose={close}
        title="Enter an invite code"
        footer={<Button title="Unlock 7 days of Pro" icon="gift-outline" loading={redeeming} disabled={code.trim().length !== 6} onPress={redeem} />}
      >
        {redeemError ? <Notice text={redeemError} /> : null}
        <Input value={code} onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="ABC234" autoCapitalize="characters" autoCorrect={false} style={{ fontSize: 24, letterSpacing: 6, textAlign: "center", fontFamily: font.bold }} />
      </Sheet>
      <Sheet
        open={sheet === "about"}
        onClose={close}
        title="About me"
        footer={
          <Button
            title="Save"
            onPress={() => {
              setPrefs({ aboutMe: about.trim() || undefined });
              close();
            }}
          />
        }
      >
        <Input value={about} onChangeText={setAbout} placeholder="e.g. 23, gym + anime, bad at cooking, dog person" maxLength={300} multiline style={{ minHeight: 90 }} />
        <T v="small" color={colors.textMute} style={{ marginTop: space(2), fontFamily: font.medium }}>
          Helps replies sound like you. Stays on your phone; only sent with your requests.
        </T>
      </Sheet>
    </Screen>
  );
}

const PRIVACY =
  "Chats are sent to our server only to write replies. Phone numbers and emails are removed first, and chats aren't stored on our servers or used for ads.";

const styles = StyleSheet.create({
  codeRow: { flexDirection: "row", alignItems: "center", gap: space(3), marginTop: space(4), padding: space(3), borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong },
});
