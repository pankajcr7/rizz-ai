import { ScrollView } from "react-native";
import { TONES, type ToneId } from "@rizz/shared";
import { GUTTER, space } from "../theme";
import { Chip } from "./ui";

const ORDER: ToneId[] = ["flirty", "funny", "smooth", "witty", "sweet", "confident", "chill", "playful", "mysterious", "deep", "romantic", "gentleman", "apology"];

/** One-tap tone switching. */
export function ToneStrip({ value, onChange, bleed = true }: { value: ToneId; onChange: (t: ToneId) => void; bleed?: boolean }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={bleed ? { marginHorizontal: -GUTTER } : undefined}
      contentContainerStyle={{ gap: space(2), paddingHorizontal: bleed ? GUTTER : 0 }}
    >
      {ORDER.map((id) => (
        <Chip key={id} label={`${TONES[id].emoji} ${TONES[id].label}`} selected={id === value} onPress={() => onChange(id)} />
      ))}
    </ScrollView>
  );
}
