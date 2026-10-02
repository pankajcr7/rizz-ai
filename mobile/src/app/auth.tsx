import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { account, errorMessage, getDeviceId } from "../api/client";
import { Button, Input, Notice, Screen, T } from "../components/ui";
import { RizzOverlay } from "../../modules/rizz-overlay";
import { useApp } from "../store";
import { useCrushes } from "../store/crushes";
import { useOpenerDraft, useProfileDraft } from "../store/drafts";
import { useProgress } from "../store/progress";
import { useSession } from "../store/session";
import { useShare } from "../store/share";
import { colors, font, radius, space } from "../theme";
import { LegalLinks } from "../components/LegalLinks";
import { identifyPurchases } from "../lib/purchasesIdentity";
import { syncKeyboard } from "../lib/keyboardSync";

export default function Auth() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setError(undefined);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (password.length < 10) return setError("Use at least 10 characters for your password.");
    if (mode === "signup" && password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    try {
      const previousId = await getDeviceId();
      const result = mode === "signup" ? await account.signUp(email.trim().toLowerCase(), password) : await account.logIn(email.trim().toLowerCase(), password);
      if (previousId !== result.deviceId) {
        useSession.getState().reset();
        useShare.setState({ card: null });
        RizzOverlay.stop();
        RizzOverlay.keyboard.clearConfig();
        RizzOverlay.smart.setApps([]);
        useApp.getState().resetAll();
        useCrushes.setState({ crushes: [], activeId: null });
        useProgress.getState().reset();
        useOpenerDraft.setState({ openerImage: null, openerBio: "" });
        useProfileDraft.setState({ images: [], bio: "", roast: false });
        RizzOverlay.smart.clearConversations();
      }
      await syncKeyboard();
      await identifyPurchases(result.deviceId).catch(() => {});
      await useApp.getState().refreshMe();
      router.replace(useApp.getState().onboarded ? "/" : "/onboarding");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen footer={<View style={{ gap: space(2) }}>
      <Button title={mode === "signup" ? "Create account" : "Log in"} icon="arrow-forward" onPress={() => void submit()} loading={busy} />
      <Button title="Continue as guest" variant="ghost" onPress={() => router.replace("/")} />
    </View>}>
      <View style={styles.brand}><T style={styles.logo}>Rizz <T style={styles.lime}>AI</T></T><Ionicons name="sparkles" size={26} color={colors.lime} /></View>
      <T style={styles.hero}>{mode === "signup" ? "Your rizz,\nyour rules." : "Welcome\nback."}</T>
      <T v="body" color={colors.textDim} style={{ marginBottom: space(8) }}>Save your plan and account across devices. Chat history is saved locally; selected content is sent when you ask for AI help.</T>

      <View style={styles.switcher}>
        {(["signup", "login"] as const).map((m) => <Pressable key={m} onPress={() => { setMode(m); setError(undefined); }} style={[styles.switch, mode === m && styles.switchOn]}><T v="bodyStrong" color={mode === m ? colors.bg : colors.textDim}>{m === "signup" ? "Sign up" : "Log in"}</T></Pressable>)}
      </View>

      <T v="caption" color={colors.textDim} style={styles.label}>EMAIL</T>
      <Input value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <T v="caption" color={colors.textDim} style={styles.label}>PASSWORD</T>
      <View style={{ position: "relative" }}>
        <Input value={password} onChangeText={setPassword} placeholder="At least 10 characters" secureTextEntry={!show} autoCapitalize="none" autoComplete={mode === "signup" ? "new-password" : "current-password"} textContentType={mode === "signup" ? "newPassword" : "password"} style={{ paddingRight: 54 }} />
        <Pressable onPress={() => setShow(!show)} accessibilityLabel={show ? "Hide password" : "Show password"} style={styles.eye}><Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={21} color={colors.textDim} /></Pressable>
      </View>
      {mode === "signup" ? <><T v="caption" color={colors.textDim} style={styles.label}>CONFIRM PASSWORD</T><Input value={confirm} onChangeText={setConfirm} placeholder="Type it again" secureTextEntry={!show} autoCapitalize="none" textContentType="newPassword" /></> : null}
      {mode === "login" ? <Button title="Forgot password?" variant="ghost" size="sm" onPress={() => router.push("/reset-password")} style={{ alignSelf: "flex-start", marginTop: space(2) }} /> : null}
      {error ? <Notice text={error} /> : null}
      <T v="small" color={colors.textMute} style={{ marginTop: space(5), lineHeight: 21 }}>Your email is used for login and account recovery. Saved chats stay on this device; selected content and your personalization settings are sent to our server and AI provider when you request help.</T>
      <LegalLinks />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: space(7), marginBottom: space(10) },
  logo: { color: colors.text, fontFamily: font.extrabold, fontSize: 38, lineHeight: 48, letterSpacing: -2 },
  lime: { color: colors.lime, fontFamily: font.extrabold, fontSize: 38, lineHeight: 48 },
  hero: { color: colors.text, fontFamily: font.extrabold, fontSize: 52, lineHeight: 55, letterSpacing: -2, marginBottom: space(3) },
  switcher: { flexDirection: "row", backgroundColor: colors.surface2, padding: 4, borderRadius: radius.pill, marginBottom: space(6) },
  switch: { flex: 1, alignItems: "center", justifyContent: "center", height: 48, borderRadius: radius.pill },
  switchOn: { backgroundColor: colors.lime },
  label: { marginTop: space(4), marginBottom: space(2) },
  eye: { position: "absolute", right: 13, top: 12, padding: 5 },
});
