import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { TONES, type Preferences, type ToneId } from "@rizz/shared";
import { Glow } from "../components/Glow";
import { LegalLinks } from "../components/LegalLinks";
import { Button, IconButton, Input, Notice, Screen, T } from "../components/ui";
import { useApp } from "../store";
import { colors, font, gradient, radius, space } from "../theme";

const STEPS = 4;
const STYLE_TONES = Object.keys(TONES) as ToneId[];
const LANGS: { id: Preferences["language"]; title: string; example: string }[] = [
  { id: "english", title: "English", example: "“ok but what's your go-to karaoke song?”" },
  { id: "hinglish", title: "Hinglish", example: "“acha ji, itna attitude? 😏”" },
  { id: "hindi", title: "हिंदी", example: "“सच में? मुझे भी वही पसंद है”" },
  { id: "tanglish", title: "Tanglish · Tenglish · Kanglish…", example: "“enna da, weekend plan enna?” — more in settings" },
  { id: "auto", title: "Match the chat", example: "Reply in whatever language they use" },
];

export default function Onboarding() {
  const finish = useApp((s) => s.finishOnboarding);
  const setPrefs = useApp((s) => s.setPrefs);
  const [step, setStep] = useState(0);
  const [tone, setTone] = useState<ToneId>("smooth");
  const [language, setLanguage] = useState<Preferences["language"]>("auto");
  const [adult, setAdult] = useState(false);
  const [pledge, setPledge] = useState(false);
  const [aboutMe, setAboutMe] = useState("");
  const [tried, setTried] = useState(false);

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const done = () => {
    if (!adult || !pledge) {
      setTried(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setPrefs({ language });
    finish({ aboutMe: aboutMe.trim(), defaultTone: tone });
    router.replace("/auth");
  };

  const footer =
    step === 0 ? (
      <Button title="Get started" icon="arrow-forward" onPress={next} />
    ) : step < STEPS - 1 ? (
      <Button title="Continue" onPress={next} />
    ) : (
      <Button title="Start rizzing" icon="sparkles" onPress={done} style={!adult || !pledge ? { opacity: 0.55 } : undefined} />
    );

  return (
    <Screen footer={footer}>
      {step > 0 ? (
        <View style={styles.progressRow}>
          <IconButton name="chevron-back" label="Back" onPress={() => setStep(step - 1)} filled />
          <View style={styles.track}>
            <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 6, width: `${(step / (STEPS - 1)) * 100}%`, borderRadius: 3 }} />
          </View>
          <View style={{ width: 40 }} />
        </View>
      ) : null}

      {step === 0 ? <Hero /> : null}

      {step === 1 ? (
        <View>
          <T v="display">What’s your style?</T>
          <T v="body" color={colors.textDim} style={{ marginTop: space(2), marginBottom: space(6) }}>
            Your default vibe. You can switch any time — there are 13.
          </T>
          <View style={{ gap: space(3) }}>
            {STYLE_TONES.map((id) => (
              <OptionCard key={id} selected={tone === id} onPress={() => setTone(id)} emoji={TONES[id].emoji} title={TONES[id].label} body={TONES[id].brief} />
            ))}
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View>
          <T v="display">How do you text?</T>
          <T v="body" color={colors.textDim} style={{ marginTop: space(2), marginBottom: space(6) }}>
            Replies will sound natural in your language.
          </T>
          <View style={{ gap: space(3) }}>
            {LANGS.map((l) => (
              <OptionCard key={l.id} selected={language === l.id} onPress={() => setLanguage(l.id)} title={l.title} body={l.example} />
            ))}
          </View>
        </View>
      ) : null}

      {step === 3 ? (
        <View>
          <T v="display">One quick thing</T>
          <T v="body" color={colors.textDim} style={{ marginTop: space(2), marginBottom: space(6) }}>
            Rizz AI helps you be more confident — never pushy.
          </T>
          <View style={{ gap: space(3), marginBottom: space(6) }}>
            <Check checked={adult} missing={tried && !adult} onPress={() => setAdult(!adult)} label="I'm 18 or older" />
            <Check checked={pledge} missing={tried && !pledge} onPress={() => setPledge(!pledge)} label="I'll keep it respectful. No means no." />
          </View>
          {tried && (!adult || !pledge) ? <Notice text="Tick both boxes to continue." /> : null}
          <T v="caption" color={colors.textMute} style={{ marginBottom: space(3) }}>
            About you · optional
          </T>
          <Input value={aboutMe} onChangeText={setAboutMe} placeholder="e.g. 23, gym + anime, dog person" maxLength={300} />
          <T v="small" color={colors.textMute} style={{ marginTop: space(2) }}>
            Saved on this phone and sent to our server and AI provider when you request help.
          </T>
          <LegalLinks />
        </View>
      ) : null}
    </Screen>
  );
}

function Hero() {
  return (
    <View style={{ paddingTop: space(6) }}>
      <Glow style={{ top: -60, left: -40, right: -40 }} />
      {/* Mini demo of the product */}
      <View style={styles.mock}>
        <View style={[styles.bubble, styles.them]}>
          <T v="body">so what are you up to this weekend?</T>
        </View>
        <View style={styles.mockReply}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: space(2) }}>
            <Ionicons name="sparkles" size={14} color={colors.pink} />
            <T v="caption" color={colors.pink}>
              Rizz AI suggests
            </T>
          </View>
          <T v="reply">plotting world domination. need a sidekick? 😏</T>
          <View style={styles.mockVibe}>
            <View style={styles.mockBar}>
              <LinearGradient colors={[colors.amber, colors.success]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: "82%", height: 6, borderRadius: 3 }} />
            </View>
            <T v="small" color={colors.success} style={{ fontFamily: font.bold }}>
              82% into you
            </T>
          </View>
        </View>
      </View>
      <T v="display" style={{ marginTop: space(10) }}>
        Never get left{"\n"}on read again.
      </T>
      <T v="body" color={colors.textDim} style={{ marginTop: space(3) }}>
        Drop a screenshot from Instagram, Tinder, Hinge or WhatsApp. Get replies that sound like you — plus a read on how into you they are.
      </T>
    </View>
  );
}

function OptionCard({ selected, onPress, emoji, title, body }: { selected: boolean; onPress: () => void; emoji?: string; title: string; body: string }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      aria-checked={selected}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.option, selected && styles.optionOn, pressed && { opacity: 0.9 }]}
    >
      {emoji ? <T style={{ fontSize: 28 }}>{emoji}</T> : null}
      <View style={{ flex: 1 }}>
        <T v="headline">{title}</T>
        <T v="small" color={colors.textDim} style={{ marginTop: 2 }}>
          {body}
        </T>
      </View>
      <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={24} color={selected ? colors.pink : colors.textMute} />
    </Pressable>
  );
}

function Check({ checked, onPress, label, missing }: { checked: boolean; onPress: () => void; label: string; missing?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      style={[styles.option, checked && styles.optionOn, missing && { borderColor: colors.danger }]}
    >
      <Ionicons name={checked ? "checkbox" : "square-outline"} size={24} color={checked ? colors.pink : missing ? colors.danger : colors.textMute} />
      <T v="bodyStrong" color={missing ? colors.danger : colors.text} style={{ flex: 1 }}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: "row", alignItems: "center", gap: space(3), marginBottom: space(8), marginTop: space(1) },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  mock: { gap: space(3) },
  bubble: { maxWidth: "80%", paddingHorizontal: space(3.5), paddingVertical: space(2.5), borderRadius: radius.lg },
  them: { alignSelf: "flex-start", backgroundColor: colors.themBubble, borderBottomLeftRadius: 6 },
  mockReply: { marginLeft: space(8), backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.pink, padding: space(4) },
  mockVibe: { flexDirection: "row", alignItems: "center", gap: space(3), marginTop: space(3) },
  mockBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: "hidden" },
  option: { flexDirection: "row", alignItems: "center", gap: space(3.5), padding: space(4), borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  optionOn: { borderColor: colors.pink, backgroundColor: colors.accentSoft },
});
