import { useEffect, useState } from "react";
import { Animated, View, type ViewStyle } from "react-native";
import { colors, radius, space } from "../theme";
import { T } from "./ui";

export function Skeleton({ width = "100%", height = 14, style }: { width?: number | `${number}%`; height?: number; style?: ViewStyle }) {
  const [pulse] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: 7, backgroundColor: colors.surface3, opacity: pulse }, style]} />;
}

export function SkeletonCard() {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), marginBottom: space(3), gap: space(2.5) }}>
      <Skeleton width="92%" height={16} />
      <Skeleton width="64%" height={16} />
      <Skeleton width="45%" height={11} style={{ marginTop: space(2) }} />
    </View>
  );
}

/** Rotating status copy while the AI works. */
export function LoadingLines({ lines }: { lines: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), 1400);
    return () => clearInterval(t);
  }, [lines.length]);
  return (
    <T v="small" color={colors.textDim} style={{ textAlign: "center", marginBottom: space(4) }} accessibilityLiveRegion="polite">
      {lines[i]}
    </T>
  );
}
