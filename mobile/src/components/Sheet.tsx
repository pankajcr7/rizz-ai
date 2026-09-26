import { useEffect, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, GUTTER, radius, space } from "../theme";
import { T } from "./ui";

/** Bottom sheet: dimmed backdrop, slides up, tap outside to close. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const [y] = useState(() => new Animated.Value(1));
  // Mount as soon as it opens (adjusting state during render is the React-recommended pattern).
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(y, { toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [open, mounted, y]);

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.6)", opacity: y.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { maxHeight: height * 0.85, paddingBottom: insets.bottom + space(4), transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) }] },
        ]}
      >
        <View style={styles.handle} />
        {title ? (
          <T v="headline" style={{ marginBottom: space(4), paddingHorizontal: GUTTER }}>
            {title}
          </T>
        ) : null}
        <ScrollView contentContainerStyle={{ paddingHorizontal: GUTTER }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        {footer ? <View style={{ paddingHorizontal: GUTTER, paddingTop: space(3) }}>{footer}</View> : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: colors.border, paddingTop: space(3) },
  handle: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: space(4) },
});
