import { StyleSheet, View } from "react-native";
import type { SuggestResponse } from "@rizz/shared";
import { colors, radius, space } from "../theme";
import { T } from "./ui";

const readLabel = (n: number) => (n >= 75 ? "warm" : n >= 55 ? "opening" : n >= 35 ? "mixed" : "cold");
const readColor = (n: number) => (n >= 55 ? colors.success : n >= 35 ? colors.warn : colors.danger);

/** Quiet, editorial readout: the signal matters more than decorative AI chrome. */
export function VibeGauge({ vibe }: { vibe: SuggestResponse["vibe"] }) {
  const pct = Math.max(0, Math.min(100, vibe.interest));
  return (
    <View style={styles.card} accessibilityLabel={`Interest ${pct} percent, ${readLabel(pct)}`}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <T v="caption" color={colors.textMute}>READ</T>
          <View style={styles.metricRow}>
            <T style={styles.number}>{pct}%</T>
            <T v="body" color={colors.textDim}>interest</T>
          </View>
        </View>
        <View style={{ minWidth: 110 }}>
          <T v="caption" color={colors.textMute}>ENERGY</T>
          <T v="title" color={readColor(pct)} style={{ marginTop: space(1.5) }}>{readLabel(pct)}</T>
        </View>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
        <View style={[styles.knob, { left: `${pct}%` }]} />
      </View>
      <T v="body" color={colors.textDim} style={{ marginTop: space(4) }}>{vibe.summary}</T>
      {vibe.signals.length ? (
        <View style={styles.signals}>
          {vibe.signals.slice(0, 3).map((signal) => (
            <View key={signal} style={styles.signal}>
              <T v="small" color={colors.textDim}>{signal}</T>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: space(5) },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space(5) },
  metricRow: { flexDirection: "row", alignItems: "baseline", gap: space(2), marginTop: space(1) },
  number: { color: colors.text, fontSize: 38, lineHeight: 46, fontWeight: "600" },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface3, marginTop: space(4), overflow: "visible" },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  knob: { position: "absolute", top: -3, width: 14, height: 14, borderRadius: 7, marginLeft: -7, backgroundColor: colors.amber },
  signals: { flexDirection: "row", flexWrap: "wrap", gap: space(1.5), marginTop: space(3) },
  signal: { borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1), backgroundColor: colors.surface2 },
});
