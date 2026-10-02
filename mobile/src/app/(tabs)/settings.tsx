import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Share as RNShare, StyleSheet, Switch, View } from "react-native";
import { levelFor, liveStreak, quotaResetLabel, TONES, type Preferences } from "@rizz/shared";
import { useCrushes } from "../../store/crushes";
import { useProgress } from "../../store/progress";
import { useSession } from "../../store/session";
import { useShare } from "../../store/share";
import { useOpenerDraft, useProfileDraft } from "../../store/drafts";
import { RizzOverlay } from "../../../modules/rizz-overlay";
import * as Clipboard from "expo-clipboard";
import { account, api, errorMessage, getDeviceId } from "../../api/client";
import { toast } from "../../components/Toast";
import { inviteText } from "../../lib/invite";
import { Sheet } from "../../components/Sheet";
import { ToneStrip } from "../../components/ToneStrip";
import { Button, Card, ChipRow, GradientBorder, Input, ListGroup, ListRow, Notice, Screen, Section, T } from "../../components/ui";
import { boldLabel, LANGUAGES } from "../../components/Vibe";
import { BrandHeader } from "../../components/BrandHeader";
import { LegalLinks } from "../../components/LegalLinks";
import { identifyPurchases } from "../../lib/purchasesIdentity";
import { useApp } from "../../store";
import { colors, font, space } from "../../theme";

type SheetId = "tone" | "language" | "boldness" | "length" | "emoji" | "about" | "style" | "redeem" | "deleteAccount" | null;

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
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  useFocusEffect(useCallback(() => { void account.email().then(setAccountEmail); }, []));
  const [about, setAbout] = useState(prefs.aboutMe ?? "");
  const [styleText, setStyleText] = useState((prefs.styleExamples ?? []).join("\n"));
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
      await account.signOut();
      useSession.getState().reset();
      useShare.setState({ card: null });
      RizzOverlay.stop();
      RizzOverlay.keyboard.clearConfig();
      RizzOverlay.smart.setApps([]);
      await identifyPurchases(await getDeviceId()).catch(() => {});
      resetAll();
      RizzOverlay.smart.clearConversations();
      useCrushes.setState({ crushes: [], activeId: null });
      useProgress.getState().reset();
      useOpenerDraft.setState({ openerImage: null, openerBio: "" });
      useProfileDraft.setState({ images: [], bio: "", roast: false });
      router.replace("/onboarding");
    };
    // Alert with buttons isn't supported on web.
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Delete saved replies, chats, progress and settings from this device? Your email account stays available for login.")) void run();
      return;
    }
    Alert.alert("Delete local data?", "Removes saved replies, chats, progress and settings from this phone. Your email account stays available for login.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run() },
    ]);
  };

  const signOut = async () => {
    await account.signOut();
    useSession.getState().reset();
    useShare.setState({ card: null });
    RizzOverlay.stop();
    RizzOverlay.keyboard.clearConfig();
    RizzOverlay.smart.setApps([]);
    await identifyPurchases(await getDeviceId()).catch(() => {});
    resetAll();
    RizzOverlay.smart.clearConversations();
    useCrushes.setState({ crushes: [], activeId: null });
    useProgress.getState().reset();
    useOpenerDraft.setState({ openerImage: null, openerBio: "" });
    useProfileDraft.setState({ images: [], bio: "", roast: false });
    router.replace("/auth");
  };

  const close = () => setSheet(null);
  const deleteAccount = async () => {
    setDeleting(true); setDeleteError(undefined);
    try {
      await account.delete(deletePassword);
      await signOut();
      toast("Account and this device's data deleted");
    } catch (e) { setDeleteError(errorMessage(e)); }
    finally { setDeleting(false); }
  };
  const lang = LANGUAGES.find((l) => l.id === prefs.language)?.label ?? prefs.language;

  return (
    <Screen>
      <BrandHeader subtitle="Your edge, in one place." />
      <T v="display" style={{ marginBottom: space(5) }}>Your profile.</T>
      <Section title="Account">
        <Card style={{ marginBottom: space(3) }}><T v="headline">{accountEmail || "Guest mode"}</T><T v="small" color={colors.textDim} style={{ marginTop: space(1) }}>{accountEmail ? "Your plan is linked to this email. Chats stay on this phone." : "Create an account to keep your plan across devices."}</T></Card>
        {accountEmail ? <Button title="Log out" variant="secondary" icon="log-out-outline" onPress={() => void signOut()} /> : <Button title="Sign up or log in" icon="person-add-outline" onPress={() => router.push("/auth")} />}
        {accountEmail ? <Button title="Delete account" variant="danger" size="md" icon="trash-outline" onPress={() => { setDeletePassword(""); setDeleteError(undefined); setSheet("deleteAccount"); }} style={{ marginTop: space(3) }} /> : null}
      </Section>
      <Section title="Your stuff"><ListGroup>
        <ListRow icon="bookmark-outline" title="Saved replies" onPress={() => router.push("/saved")} />
        <ListRow icon="images-outline" title="Review my dating profile" onPress={() => router.push("/profile-review")} last />
      </ListGroup></Section>

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
          <ListRow icon="chatbubble-ellipses-outline" title="My texting style" value={prefs.styleExamples?.length ? `${prefs.styleExamples.length} examples` : "Teach it"} onPress={() => setSheet("style")} />
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
          <ListRow icon="trash-outline" title="Delete local data" danger onPress={confirmDelete} last />
        </ListGroup>
      </Section>
      {quota?.limit !== null && quota?.resetsAt ? <T v="small" color={colors.textDim} style={{ marginBottom: space(4) }}>{quotaResetLabel(quota.resetsAt)}</T> : null}
      <LegalLinks />

      <T v="small" color={colors.textMute} style={{ textAlign: "center" }}>
        {PRIVACY}
      </T>
      <T v="small" color={colors.textMute} style={{ textAlign: "center", marginTop: space(3) }}>
        Rizz AI {Constants.expoConfig?.version ?? ""} · 18+ only
      </T>

      {/* Sheets */}
      <Sheet open={sheet === "deleteAccount"} onClose={() => { if (!deleting) close(); }} title="Delete your account?" footer={<Button title="Delete account and local data" variant="danger" loading={deleting} disabled={!deletePassword} onPress={() => void deleteAccount()} />}>
        <T v="body" color={colors.textDim} style={{ marginBottom: space(4) }}>This removes your email account, usage, plan and invite records and clears data on this device. Other devices keep their local copies. This cannot be undone. Cancel any paid subscription in your app store separately.</T>
        <Input accessibilityLabel="Current password to confirm deletion" value={deletePassword} onChangeText={setDeletePassword} secureTextEntry autoCapitalize="none" placeholder="Your current password" maxLength={128} />
        {deleteError ? <Notice text={deleteError} /> : null}
        <Button title="Forgot your password?" variant="ghost" size="sm" onPress={() => { close(); router.push("/reset-password"); }} style={{ marginTop: space(3) }} />
      </Sheet>
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
        open={sheet === "style"}
        onClose={close}
        title="Teach Rizz AI your style"
        footer={
          <Button
            title="Save my style"
            onPress={() => {
              const examples = styleText
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 5);
              setPrefs({ styleExamples: examples.length ? examples : undefined });
              close();
            }}
          />
        }
      >
        <T v="small" color={colors.textDim} style={{ marginBottom: space(3) }}>
          Paste 3–5 messages you actually sent. Put one message per line. We copy your rhythm, slang and punctuation — never the facts inside them.
        </T>
        <Input
          value={styleText}
          onChangeText={setStyleText}
          placeholder={"haha fair enough 😂\nkal dekhte hain kya scene hai\nngl that sounds fun"}
          maxLength={1500}
          multiline
          style={{ minHeight: 150 }}
        />
        {prefs.styleAvoid?.length ? (
          <View style={{ marginTop: space(4) }}>
            <T v="small" color={colors.textDim}>
              Learned from your feedback: {prefs.styleAvoid.length} preference{prefs.styleAvoid.length === 1 ? "" : "s"}.
            </T>
            <Button title="Clear learned feedback" variant="ghost" size="sm" onPress={() => setPrefs({ styleAvoid: undefined })} style={{ alignSelf: "flex-start", marginTop: space(2) }} />
          </View>
        ) : null}
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
          Saved locally and sent to our server and AI provider with your requests to help replies sound like you.
        </T>
      </Sheet>
    </Screen>
  );
}

const PRIVACY =
  "Selected chats and personalization details go to our server and AI provider when you request help. Contact details are removed from text before it reaches the AI; photos and audio are not automatically redacted. Provider retention and use vary — see the privacy policy.";

const styles = StyleSheet.create({
  codeRow: { flexDirection: "row", alignItems: "center", gap: space(3), marginTop: space(4), padding: space(3), borderRadius: 14, backgroundColor: colors.surface2, borderWidth: 1, borderStyle: "dashed", borderColor: colors.borderStrong },
});
