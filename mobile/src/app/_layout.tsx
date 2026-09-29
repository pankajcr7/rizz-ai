import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/plus-jakarta-sans";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ToastHost } from "../components/Toast";
import * as Notifications from "expo-notifications";
import { startKeyboardSync } from "../lib/keyboardSync";
import { configureNotifications } from "../lib/nudges";
import { startLiveBridge } from "../lib/liveBridge";
import { useApp } from "../store";
import { colors } from "../theme";
import { initializePurchases } from "../lib/purchasesIdentity";

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(useApp.persist.hasHydrated());
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    const unsub = useApp.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => startLiveBridge(), []);
  useEffect(() => {
    configureNotifications();
    // Tapping a "they're waiting on you" nudge opens that crush.
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.content.data?.crushId;
      if (typeof id === "string") router.push(`/crush/${id}`);
    });
    return () => sub.remove();
  }, []);
  useEffect(() => (hydrated ? startKeyboardSync() : undefined), [hydrated]);
  // Plan, referral code and server features (e.g. voice) — fetched once at startup.
  useEffect(() => {
    if (hydrated) void useApp.getState().refreshMe();
  }, [hydrated]);

  useEffect(() => {
    void initializePurchases();
  }, []);

  if (!hydrated || !fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="auth" />
        <Stack.Screen name="results" />
        <Stack.Screen name="profile-review" />
        <Stack.Screen name="live" />
        <Stack.Screen name="paywall" options={{ presentation: "modal" }} />
        <Stack.Screen name="share" options={{ presentation: "modal" }} />
        <Stack.Screen name="keyboard" />
        <Stack.Screen name="progress" />
        <Stack.Screen name="date" />
        <Stack.Screen name="crush/[id]" />
        <Stack.Screen name="notifications" />
      </Stack>
      <ToastHost />
    </>
  );
}
