import { useEffect, useState } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import type { SuggestResponse } from "@rizz/shared";
import { colors, radius, space } from "../theme";
import { T } from "./ui";

const W = 220;
const STROKE = 16;
const R = (W - STROKE) / 2;
const CX = W / 2;
const CY = R + STROKE / 2;
const ARC = `M ${STROKE / 2} ${CY} A ${R} ${R} 0 0 1 ${W - STROKE / 2} ${CY}`;
const LEN = Math.PI * R;

const verdict = (n: number) => (n >= 75 ? "Into you 🔥" : n >= 55 ? "Warming up" : n >= 35 ? "Neutral" : "Cold");
const verdictColor = (n: number) => (n >= 55 ? colors.success : n >= 35 ? colors.warn : colors.danger);

/** Semicircle interest gauge; fills from 0 to the value over ~800ms. */
export function VibeGauge({ vibe }: { vibe: SuggestResponse["vibe"] }) {
  const [anim] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState(0);

  useEffect(() => {
    anim.setValue(0);
    const id = anim.addListener(({ value }) => setShown(value));
    Animated.timing(anim, { toValue: vibe.interest, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [vibe.interest, anim]);

  const angle = Math.PI * (1 - shown / 100);
  const knob = { x: CX + R * Math.cos(angle), y: CY - R * Math.sin(angle) };

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), alignItems: "center" }}>
      <T v="caption" color={colors.textMute} style={{ alignSelf: "flex-start", marginBottom: space(2) }}>
        Vibe check
      </T>
      <View style={{ width: W, height: CY + 6 }} accessibilityLabel={`Interest ${vibe.interest} percent, ${verdict(vibe.interest)}`}>
        <Svg width={W} height={CY + 6}>
          <Defs>
            <LinearGradient id="g" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.danger} />
              <Stop offset="0.5" stopColor={colors.amber} />
              <Stop offset="1" stopColor={colors.success} />
            </LinearGradient>
          </Defs>
          <Path d={ARC} stroke={colors.surface3} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
          <Path d={ARC} stroke="url(#g)" strokeWidth={STROKE} strokeLinecap="round" fill="none" strokeDasharray={`${LEN}`} strokeDashoffset={LEN * (1 - shown / 100)} />
          <Path d={`M ${knob.x} ${knob.y} m -7 0 a 7 7 0 1 0 14 0 a 7 7 0 1 0 -14 0`} fill={colors.text} />
        </Svg>
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" }}>
          <T v="display">{Math.round(shown)}%</T>
        </View>
      </View>
      <T v="bodyStrong" color={verdictColor(vibe.interest)} style={{ marginTop: space(1) }}>
        {verdict(vibe.interest)} · {vibe.mood}
      </T>
      <T v="small" color={colors.textDim} style={{ textAlign: "center", marginTop: space(1.5) }}>
        {vibe.summary}
      </T>
      {vibe.signals.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(1.5), justifyContent: "center", marginTop: space(3) }}>
          {vibe.signals.map((s) => (
            <View key={s} style={{ backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) }}>
              <T v="small" color={colors.textDim} style={{ fontSize: 12 }}>
                {s}
              </T>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
