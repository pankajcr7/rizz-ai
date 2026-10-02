/**
 * Progressive disclosure for generation settings: a compact pill row that
 * summarises tone / boldness / language, opening one sheet with everything.
 */
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { hasChatBoundary, STAGES, TONES, type Preferences } from "@rizz/shared";
import { GOAL_OPTIONS, PLATFORM_OPTIONS, STAGE_OPTIONS } from "../lib/options";
import { useApp } from "../store";
import { colors, font, GUTTER, radius, space } from "../theme";
import { Sheet } from "./Sheet";
import { ToneStrip } from "./ToneStrip";
import { Button, ChipRow, Section, T } from "./ui";

export const LANGUAGES: { id: Preferences["language"]; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "english", label: "English" },
  { id: "hinglish", label: "Hinglish" },
  { id: "hindi", label: "हिंदी" },
  { id: "tanglish", label: "Tanglish" },
  { id: "tenglish", label: "Tenglish" },
  { id: "kanglish", label: "Kanglish" },
  { id: "manglish", label: "Manglish" },
  { id: "benglish", label: "Benglish" },
  { id: "punglish", label: "Punglish" },
  { id: "spanish", label: "Español" },
  { id: "portuguese", label: "Português" },
  { id: "french", label: "Français" },
  { id: "german", label: "Deutsch" },
  { id: "arabic", label: "العربية" },
];

const BOLD_LABELS = ["Safe", "Chill", "Playful", "Bold", "Spicy"];
export const boldLabel = (n: number) => BOLD_LABELS[n - 1] ?? "Playful";

export function VibePills({ onOpen, showGoal }: { onOpen: () => void; showGoal?: boolean }) {
  const { defaultTone, prefs, goal, stage, draftChat } = useApp();
  const tone = TONES[defaultTone];
  const stageLabel = stage === "auto" ? null : `${STAGES[stage].emoji} ${STAGES[stage].label}`;
  const goalLabel = hasChatBoundary(draftChat) ? "Respect their boundary" : GOAL_OPTIONS.find((g) => g.id === goal)?.label;
  const lang = LANGUAGES.find((l) => l.id === prefs.language)?.label ?? prefs.language;
  const pills = [`${tone.emoji} ${tone.label}`, `🌶 ${boldLabel(prefs.boldness)}`, ...(showGoal && stageLabel ? [stageLabel] : []), ...(showGoal && goalLabel ? [goalLabel] : []), lang];
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onOpen();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Vibe settings: ${pills.join(", ")}. Tap to change.`}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: space(2), paddingHorizontal: GUTTER }} pointerEvents="none">
        {pills.map((p) => (
          <View key={p} style={styles.pill}>
            <T v="small" style={{ fontFamily: font.semibold }}>
              {p}
            </T>
          </View>
        ))}
        <View style={[styles.pill, { backgroundColor: "transparent" }]}>
          <Ionicons name="options-outline" size={16} color={colors.pink} />
          <T v="small" color={colors.pink} style={{ fontFamily: font.bold }}>
            Vibe
          </T>
        </View>
      </ScrollView>
    </Pressable>
  );
}

export function VibeSheet({ open, onClose, showGoal }: { open: boolean; onClose: () => void; showGoal?: boolean }) {
  const { defaultTone, setDefaultTone, prefs, setPrefs, goal, setGoal, stage, setStage, platform, setPlatform, draftChat } = useApp();
  return (
    <Sheet open={open} onClose={onClose} title="Set the vibe" footer={<Button title="Done" onPress={onClose} />}>
      <Section title="Tone">
        <ToneStrip value={defaultTone} onChange={setDefaultTone} />
      </Section>

      <Section title={`Boldness · ${boldLabel(prefs.boldness)}`}>
        <View style={styles.spice} accessibilityRole="adjustable" accessibilityValue={{ min: 1, max: 5, now: prefs.boldness }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              accessibilityLabel={`Boldness ${n}: ${boldLabel(n)}`}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setPrefs({ boldness: n });
              }}
              style={[styles.pepper, n <= prefs.boldness && styles.pepperOn]}
            >
              <T style={{ fontSize: 20, opacity: n <= prefs.boldness ? 1 : 0.3 }}>🌶</T>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space(2) }}>
          <T v="small" color={colors.textMute}>
            Safe
          </T>
          <T v="small" color={colors.textMute}>
            Bold
          </T>
        </View>
      </Section>

      {showGoal ? (
        <Section title="How well do you know them?">
          <ChipRow options={STAGE_OPTIONS} value={stage} onChange={setStage} wrap />
          <T v="small" color={colors.textMute} style={{ marginTop: space(2) }}>
            {STAGES[stage].hint}. {stage === "first_dm" || stage === "new" ? "Replies will give them an easy reason to keep chatting." : ""}
          </T>
        </Section>
      ) : null}

      {showGoal ? (
        <Section title="Goal">
          {hasChatBoundary(draftChat) ? <T v="small" color={colors.textDim}>They asked to stop. Respect their boundary and give them space.</T> : <ChipRow options={GOAL_OPTIONS} value={goal} onChange={setGoal} wrap />}
        </Section>
      ) : null}

      <Section title="Language">
        <ChipRow options={LANGUAGES} value={prefs.language} onChange={(language) => setPrefs({ language })} wrap />
      </Section>

      <Section title="App">
        <ChipRow options={PLATFORM_OPTIONS} value={platform} onChange={setPlatform} wrap />
      </Section>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: space(3.5), borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  spice: { flexDirection: "row", gap: space(2) },
  pepper: { flex: 1, height: 48, borderRadius: radius.sm, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  pepperOn: { backgroundColor: colors.accentSoft, borderColor: colors.pink },
});
