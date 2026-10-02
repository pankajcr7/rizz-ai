import { useEffect, useRef } from "react";
import { ScrollView, View } from "react-native";
import { TONES, type ToneId } from "@rizz/shared";
import { GUTTER, space } from "../theme";
import { Chip } from "./ui";

const ORDER: ToneId[] = ["flirty", "funny", "smooth", "witty", "sweet", "confident", "chill", "playful", "mysterious", "deep", "romantic", "gentleman", "apology"];

/** One-tap tone switching. */
export function ToneStrip({ value, onChange, bleed = true }: { value: ToneId; onChange: (t: ToneId) => void; bleed?: boolean }) {
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Partial<Record<ToneId, number>>>({});
  useEffect(() => {
    const x = offsets.current[value];
    if (x !== undefined) scroll.current?.scrollTo({ x: Math.max(0, x - GUTTER), animated: true });
  }, [value]);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={bleed ? { marginHorizontal: -GUTTER } : undefined}
      contentContainerStyle={{ gap: space(2), paddingHorizontal: bleed ? GUTTER : 0 }}
    >
      {ORDER.map((id) => (
        <View key={id} onLayout={(e) => {
          offsets.current[id] = e.nativeEvent.layout.x;
          if (id === value) scroll.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - GUTTER), animated: false });
        }}><Chip label={`${TONES[id].emoji} ${TONES[id].label}`} selected={id === value} onPress={() => onChange(id)} /></View>
      ))}
    </ScrollView>
  );
}
