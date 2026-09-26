/**
 * Story-ready (9:16) share cards — the app's viral loop. Every card carries
 * the brand and the user's invite code.
 */
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { forwardRef } from "react";
import { StyleSheet, View } from "react-native";
import type { CardData } from "../store/share";
import { colors, font, gradient, radius, space } from "../theme";
import { Glow } from "./Glow";
import { T } from "./ui";

export const CARD_W = 300;
export const CARD_H = (CARD_W * 16) / 9;

const verdictColor = (n: number) => (n >= 55 ? colors.success : n >= 35 ? colors.warn : colors.danger);

export const ShareCard = forwardRef<View, { card: CardData; code?: string }>(function ShareCard({ card, code }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient colors={["#1A0F1A", "#0B0A0F"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <Glow height={CARD_H * 0.7} style={{ top: -CARD_H * 0.15, left: -60, right: -60 }} />

      <View style={styles.brandRow}>
        <LinearGradient colors={gradient.brand} start={gradient.start} end={gradient.end} style={styles.logo}>
          <Ionicons name="sparkles" size={14} color="#fff" />
        </LinearGradient>
        <T v="bodyStrong" style={{ fontFamily: font.extrabold }}>
          Rizz AI
        </T>
      </View>

      <View style={{ flex: 1, justifyContent: "center" }}>
        {card.kind === "vibe" ? (
          <>
            <T v="caption" color={colors.textDim}>
              {card.theirName ? `${card.theirName}'s vibe` : "Vibe check"}
            </T>
            <T style={[styles.big, { color: verdictColor(card.interest) }]}>{card.interest}%</T>
            <T v="title">{card.verdict}</T>
            <View style={styles.quote}>
              <T v="caption" color={colors.pink} style={{ marginBottom: space(1.5) }}>
                My reply
              </T>
              <T v="reply">“{card.line}”</T>
            </View>
          </>
        ) : null}

        {card.kind === "practice" ? (
          <>
            <T v="caption" color={colors.textDim}>
              Practice rizz score
            </T>
            <T style={[styles.big, { color: card.avg >= 7 ? colors.success : card.avg >= 4 ? colors.warn : colors.danger }]}>{card.avg.toFixed(1)}</T>
            <T v="title">out of 10</T>
            <T v="small" color={colors.textDim} style={{ marginTop: space(2) }}>
              {card.messages} messages vs a {card.persona.toLowerCase()} match
            </T>
            {card.best ? (
              <View style={styles.quote}>
                <T v="caption" color={colors.pink} style={{ marginBottom: space(1.5) }}>
                  Best line
                </T>
                <T v="reply">“{card.best}”</T>
              </View>
            ) : null}
          </>
        ) : null}

        {card.kind === "profile" ? (
          <>
            <T v="caption" color={colors.textDim}>
              My dating profile score
            </T>
            <T style={[styles.big, { color: card.score >= 7 ? colors.success : card.score >= 5 ? colors.warn : colors.danger }]}>{card.score.toFixed(1)}</T>
            <T v="title">out of 10</T>
            <View style={styles.quote}>
              <T v="reply">{card.firstImpression}</T>
            </View>
          </>
        ) : null}
      </View>

      <View style={styles.footer}>
        <T v="small" color={colors.textDim}>
          Get your rizz checked
        </T>
        {code ? (
          <View style={styles.code}>
            <T v="small" style={{ fontFamily: font.bold, letterSpacing: 1.5 }}>
              {code}
            </T>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { width: CARD_W, height: CARD_H, borderRadius: radius.xl, overflow: "hidden", padding: space(6), backgroundColor: colors.bg },
  brandRow: { flexDirection: "row", alignItems: "center", gap: space(2) },
  logo: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  big: { fontFamily: font.extrabold, fontSize: 96, lineHeight: 104, letterSpacing: -3, marginTop: space(1) },
  quote: { marginTop: space(6), padding: space(4), borderRadius: radius.lg, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  code: { paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: radius.pill, borderWidth: 1, borderColor: colors.pink },
});
