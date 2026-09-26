import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { colors } from "../theme";

/** Soft, edge-less brand glow for hero areas (sits behind content). */
export function Glow({ height = 360, style }: { height?: number; style?: ViewStyle }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height, overflow: "hidden" }, style]}>
      <Svg width="100%" height={height} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="38%" rx="60%" ry="55%">
            <Stop offset="0" stopColor={colors.pink} stopOpacity="0.28" />
            <Stop offset="0.45" stopColor={colors.coral} stopOpacity="0.10" />
            <Stop offset="1" stopColor={colors.bg} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50" cy="40" rx="75" ry="60" fill="url(#glow)" />
      </Svg>
    </View>
  );
}
