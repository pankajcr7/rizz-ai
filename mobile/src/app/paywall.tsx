import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { api } from "../api/client";
import { Glow } from "../components/Glow";
import { Button, IconButton, Notice, Screen, T } from "../components/ui";
import { useApp } from "../store";
import { colors, font, gradient, radius, space } from "../theme";

const BENEFITS = [
  { icon: "infinite" as const, text: "Unlimited replies, openers & chat" },
  { icon: "radio-button-on" as const, text: "Live mode in any chat app" },
  { icon: "pulse" as const, text: "Vibe check + coaching on every chat" },
];

export default function Paywall() {
  const setQuota = useApp((s) => s.setQuota);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState<string>();
  const [buying, setBuying] = useState(false);
  const [canClose, setCanClose] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setCanClose(true), 2000);
    Purchases.getOfferings()
      .then((o) => {
        const pkgs = o.current?.availablePackages ?? [];
        setPackages(pkgs);
        // Pre-select the yearly plan (best value) if there is one.
        setSelected((pkgs.find((p) => p.packageType === "ANNUAL") ?? pkgs[0])?.identifier);
      })
      .catch(() => setError("Plans aren't available right now. Purchases work in the phone app."));
    return () => clearTimeout(t);
  }, []);

  const pkg = packages.find((p) => p.identifier === selected);
  const hasTrial = !!pkg?.product.introPrice && pkg.product.introPrice.price === 0;

  const buy = async () => {
    if (!pkg) return;
    setError(undefined);
    setBuying(true);
    try {
      await Purchases.purchasePackage(pkg);
      setTimeout(() => api.me().then((r) => setQuota(r.quota)).catch(() => {}), 2000);
      router.back();
    } catch (e) {
      if (!(e as { userCancelled?: boolean }).userCancelled) setError("Purchase didn't go through. You haven't been charged.");
    } finally {
      setBuying(false);
    }
  };

  return (
    <Screen
      footer={
        <View>
          <Button title={hasTrial ? "Start free trial" : "Continue"} icon="diamond" loading={buying} disabled={!pkg} onPress={buy} />
          <View style={{ flexDirection: "row", justifyContent: "center", gap: space(5), marginTop: space(3) }}>
            <T v="small" color={colors.textMute} onPress={() => Purchases.restorePurchases().catch(() => {})}>
              Restore
            </T>
            <T v="small" color={colors.textMute}>
              Cancel anytime
            </T>
          </View>
        </View>
      }
    >
      <View style={{ height: 40, alignItems: "flex-end" }}>{canClose ? <IconButton name="close" label="Close" onPress={() => router.back()} filled /> : null}</View>

      <Glow height={420} style={{ top: -20, left: -40, right: -40 }} />
      <T v="display" style={{ textAlign: "center" }}>
        Unlock your{"\n"}full rizz 👑
      </T>

      {/* Before / after */}
      <View style={styles.compare}>
        <View style={[styles.side, { opacity: 0.7 }]}>
          <T v="caption" color={colors.textMute}>
            You
          </T>
          <View style={styles.dry}>
            <T v="small">hey</T>
          </View>
          <T v="small" color={colors.danger} style={{ fontFamily: font.bold }}>
            18% · left on read
          </T>
        </View>
        <Ionicons name="arrow-forward" size={20} color={colors.textMute} />
        <View style={styles.side}>
          <T v="caption" color={colors.pink}>
            With Rizz AI
          </T>
          <View style={styles.rizz}>
            <T v="small">ok your dog is the real star here. what’s his name? 🐶</T>
          </View>
          <T v="small" color={colors.success} style={{ fontFamily: font.bold }}>
            84% · replied in 2 min
          </T>
        </View>
      </View>

      <View style={{ gap: space(3), marginBottom: space(6) }}>
        {BENEFITS.map((b) => (
          <View key={b.text} style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
            <View style={styles.benefitIcon}>
              <Ionicons name={b.icon} size={17} color={colors.pink} />
            </View>
            <T v="bodyStrong">{b.text}</T>
          </View>
        ))}
      </View>

      {hasTrial ? (
        <View style={styles.timeline}>
          {[
            ["Today", "Full access, free"],
            ["Day 2", "We remind you before it ends"],
            ["Day 3", `Trial ends · ${pkg?.product.priceString}`],
          ].map(([d, t], i) => (
            <View key={d} style={{ flexDirection: "row", gap: space(3), alignItems: "center" }}>
              <View style={[styles.tlDot, i === 0 && { backgroundColor: colors.pink }]} />
              <T v="bodyStrong" style={{ width: 56 }}>
                {d}
              </T>
              <T v="small" color={colors.textDim}>
                {t}
              </T>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Notice text={error} tone="info" /> : null}

      <View style={{ gap: space(3) }}>
        {packages.map((p) => {
          const on = p.identifier === selected;
          const yearly = p.packageType === "ANNUAL";
          return (
            <Pressable key={p.identifier} onPress={() => setSelected(p.identifier)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[styles.plan, on && styles.planOn]}>
              <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={22} color={on ? colors.pink : colors.textMute} />
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{p.product.title.replace(/\s*\(.*\)$/, "")}</T>
                <T v="small" color={colors.textDim}>
                  {p.product.priceString}
                  {yearly && p.product.pricePerWeekString ? ` · ${p.product.pricePerWeekString}/week` : ""}
                </T>
              </View>
              {yearly ? (
                <LinearGradient colors={gradient.brand} start={gradient.start} end={gradient.end} style={styles.badge}>
                  <T v="caption" color="#fff" style={{ fontSize: 10 }}>
                    Best value
                  </T>
                </LinearGradient>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  compare: { flexDirection: "row", alignItems: "center", gap: space(2), marginVertical: space(7) },
  side: { flex: 1, gap: space(2) },
  dry: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: space(3), minHeight: 60, justifyContent: "center" },
  rizz: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space(3), borderWidth: 1.5, borderColor: colors.pink, minHeight: 60 },
  benefitIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  timeline: { gap: space(3), padding: space(4), borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: space(5) },
  tlDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.surface3 },
  plan: { flexDirection: "row", alignItems: "center", gap: space(3), padding: space(4), borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  planOn: { borderColor: colors.pink, backgroundColor: colors.accentSoft },
  badge: { borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
});
