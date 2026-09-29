/**
 * Rizz AI component kit. Screens compose these; they never hand-roll colours,
 * fonts or spacing.
 */
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, glow, gradient, GUTTER, radius, space, type } from "../theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

type Variant = keyof typeof type;
export function T({
  v = "body",
  color = colors.text,
  style,
  ...rest
}: TextProps & { v?: Variant; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[type[v], { color }, style]} />;
}

/** Text filled with the brand gradient isn't portable; use a solid accent. */
export const Accent = ({ children }: { children: ReactNode }) => <Text style={{ color: colors.lime }}>{children}</Text>;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  scroll = true,
  footer,
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  /** Sticky content pinned to the bottom (e.g. the primary CTA). */
  footer?: ReactNode;
  padded?: boolean;
}) {
  const pad = padded ? { paddingHorizontal: GUTTER } : null;
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[pad, { paddingTop: space(2), paddingBottom: footer ? space(28) : space(10) }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Header({ title, subtitle, right, left }: { title: string; subtitle?: string; right?: ReactNode; left?: ReactNode }) {
  return (
    <View style={styles.header}>
      {left}
      <View style={{ flex: 1 }}>
        <T v="title">{title}</T>
        {subtitle ? (
          <T v="small" color={colors.textDim} style={{ marginTop: 2 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Section({ title, action, children, style }: { title?: string; action?: ReactNode; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[{ marginBottom: space(6) }, style]}>
      {title ? (
        <View style={styles.sectionHead}>
          <T v="caption" color={colors.textMute}>
            {title}
          </T>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

/** 1px gradient border around content — for "special" cards (Pro, selected). */
export function GradientBorder({ children, style, radiusSize = radius.lg }: { children: ReactNode; style?: ViewStyle; radiusSize?: number }) {
  return (
    <LinearGradient colors={gradient.brand} start={gradient.start} end={gradient.end} style={[{ borderRadius: radiusSize, padding: 1.5 }, style]}>
      <View style={{ borderRadius: radiusSize - 1.5, backgroundColor: colors.surface, overflow: "hidden" }}>{children}</View>
    </LinearGradient>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
  size = "lg",
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: "lg" | "md" | "sm";
}) {
  const off = !!(disabled || loading);
  const height = size === "lg" ? 60 : size === "md" ? 48 : 38;
  const textColor = variant === "primary" ? colors.bg : variant === "ghost" ? colors.textDim : variant === "danger" ? colors.danger : colors.text;
  const content = (
    <View style={[styles.buttonInner, { height }]}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === "sm" ? 16 : 19} color={textColor} /> : null}
          <T v={size === "sm" ? "small" : "bodyStrong"} color={textColor} style={{ fontFamily: font.extrabold, fontSize: size === "lg" ? 17 : undefined }}>
            {title}
          </T>
        </>
      )}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        { borderRadius: radius.pill, overflow: "hidden" },
        variant === "primary" && !off && glow,
        variant === "secondary" && styles.secondary,
        variant === "danger" && { backgroundColor: colors.dangerBg },
        pressed && styles.pressed,
        off && { opacity: 0.45 },
        style,
      ]}
    >
      {variant === "primary" ? (
        <LinearGradient colors={gradient.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
          {content}
        </LinearGradient>
      ) : (
        content
      )}
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  label,
  color = colors.textDim,
  size = 20,
  filled,
  style,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  filled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.iconButton, filled && { backgroundColor: colors.surface2, borderColor: colors.border, borderWidth: 1 }, pressed && styles.pressed, style]}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

export function Chip({
  label,
  selected,
  onPress,
  icon,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed, style]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.bg : colors.textDim} /> : null}
      <T v="small" color={selected ? colors.bg : colors.textDim} style={{ fontFamily: font.bold }}>
        {label}
      </T>
    </Pressable>
  );
}

export function ChipRow<K extends string>({
  options,
  value,
  onChange,
  wrap,
}: {
  options: { id: K; label: string; icon?: IconName }[];
  value: K;
  onChange: (v: K) => void;
  wrap?: boolean;
}) {
  const chips = options.map((o) => <Chip key={o.id} label={o.label} icon={o.icon} selected={o.id === value} onPress={() => onChange(o.id)} />);
  if (wrap) return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>{chips}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2), paddingRight: GUTTER }}>
      {chips}
    </ScrollView>
  );
}

/** iOS-style segmented control. */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { id: K; label: string; icon?: IconName }[];
  value: K;
  onChange: (v: K) => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.id);
            }}
            style={[styles.segment, on && styles.segmentOn]}
          >
            {o.icon ? <Ionicons name={o.icon} size={16} color={on ? colors.bg : colors.textMute} /> : null}
            <T v="small" color={on ? colors.bg : colors.textMute} style={{ fontFamily: font.bold }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inputs & feedback
// ---------------------------------------------------------------------------

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMute}
      selectionColor={colors.pink}
      {...props}
      style={[styles.input, props.multiline && { minHeight: 110, textAlignVertical: "top" }, props.style]}
    />
  );
}

export function Notice({
  text,
  tone = "danger",
  icon,
  action,
}: {
  text: string;
  tone?: "danger" | "info" | "warn" | "success";
  icon?: IconName;
  action?: { label: string; onPress: () => void };
}) {
  const c = { danger: colors.danger, info: colors.info, warn: colors.warn, success: colors.success }[tone];
  const bg = { danger: colors.dangerBg, info: colors.infoSoft, warn: "rgba(251,191,36,0.12)", success: colors.successSoft }[tone];
  const ic: IconName = icon ?? (tone === "danger" ? "alert-circle" : tone === "info" ? "sparkles" : tone === "warn" ? "warning" : "checkmark-circle");
  return (
    <View style={[styles.notice, { backgroundColor: bg }]} accessibilityRole="alert">
      <Ionicons name={ic} size={18} color={c} style={{ marginTop: 1 }} />
      <T v="small" color={colors.text} style={{ flex: 1 }}>
        {text}
      </T>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8}>
          <T v="small" color={c} style={{ fontFamily: font.bold }}>
            {action.label}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.pink} />
      </View>
      <T v="headline" style={{ textAlign: "center" }}>
        {title}
      </T>
      <T v="small" color={colors.textDim} style={{ textAlign: "center", marginTop: space(1), maxWidth: 280 }}>
        {body}
      </T>
      {action ? <Button title={action.label} onPress={action.onPress} size="md" style={{ marginTop: space(5), minWidth: 200 }} /> : null}
    </View>
  );
}

/** A grouped-list row (settings). */
export function ListRow({
  icon,
  title,
  value,
  onPress,
  right,
  danger,
  last,
}: {
  icon: IconName;
  title: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && { backgroundColor: colors.surface2 }]}>
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerBg }]}>
        <Ionicons name={icon} size={17} color={danger ? colors.danger : colors.text} />
      </View>
      <T v="bodyStrong" color={danger ? colors.danger : colors.text} style={{ flex: 1 }}>
        {title}
      </T>
      {value ? (
        <T v="small" color={colors.textDim} numberOfLines={1} style={{ maxWidth: 150 }}>
          {value}
        </T>
      ) : null}
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={colors.textMute} /> : null)}
    </Pressable>
  );
}

export function ListGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: space(3), paddingTop: space(2), paddingBottom: space(5) },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space(3) },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: GUTTER, paddingTop: space(3), paddingBottom: space(4), backgroundColor: "rgba(11,11,12,0.97)" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border, padding: space(4) },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  buttonInner: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space(2), paddingHorizontal: space(5) },
  secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space(3.5), height: 42, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  chipOn: { backgroundColor: colors.lime, borderColor: colors.lime },
  segmented: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.border },
  segment: { flex: 1, flexDirection: "row", gap: 6, height: 38, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.lime },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: radius.md, paddingHorizontal: space(4), paddingVertical: space(3.5), fontSize: 15, fontFamily: font.medium, borderWidth: 1, borderColor: colors.border },
  notice: { flexDirection: "row", gap: space(2.5), borderRadius: radius.md, padding: space(3.5), marginBottom: space(3), alignItems: "flex-start" },
  empty: { alignItems: "center", paddingVertical: space(14), paddingHorizontal: space(6) },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center", marginBottom: space(4) },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space(3), paddingHorizontal: space(4), minHeight: 56 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
});
