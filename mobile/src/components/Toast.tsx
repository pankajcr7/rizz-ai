import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";
import { colors, radius, space } from "../theme";
import { T, type IconName } from "./ui";

interface ToastState {
  message: string | null;
  icon: IconName;
  key: number;
  show: (message: string, icon?: IconName) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  icon: "checkmark-circle",
  key: 0,
  show: (message, icon = "checkmark-circle") => set((s) => ({ message, icon, key: s.key + 1 })),
  hide: () => set({ message: null }),
}));

export const toast = (message: string, icon?: IconName) => useToast.getState().show(message, icon);

/** Mounted once at the root. Pill at the bottom, auto-hides after 1.6s. */
export function ToastHost() {
  const { message, icon, key, hide } = useToast();
  const insets = useSafeAreaInsets();
  const [a] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!message) return;
    a.setValue(0);
    Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    const t = setTimeout(() => Animated.timing(a, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => hide()), 1600);
    return () => clearTimeout(t);
  }, [key, message, a, hide]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.toast, { bottom: insets.bottom + 96, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}
    >
      <Ionicons name={icon} size={18} color={colors.success} />
      <T v="bodyStrong">{message}</T>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: colors.surface3, borderRadius: radius.pill, paddingHorizontal: space(5), paddingVertical: space(3), borderWidth: 1, borderColor: colors.borderStrong },
});
