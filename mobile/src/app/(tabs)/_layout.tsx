import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { Pressable, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "../../components/Toast";
import type { IconName } from "../../components/ui";
import { scanScreenshotToDraft } from "../../lib/scan";
import { useApp } from "../../store";
import { colors, font, glow, gradient } from "../../theme";

function tabIcon(outline: IconName, filled: IconName) {
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={focused ? filled : outline} size={23} color={color as string} />;
  }
  return TabIcon;
}

/** Centre action: jump straight to the screenshot picker. */
function ScanButton() {
  const platform = useApp((s) => s.platform);
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan a chat screenshot"
        onPress={async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          router.navigate("/");
          const r = await scanScreenshotToDraft(platform);
          if (r.error) toast(r.error, "alert-circle");
        }}
        style={({ pressed }) => [{ marginTop: -18, borderRadius: 30 }, glow, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        <LinearGradient colors={gradient.brand} start={gradient.start} end={gradient.end} style={{ width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: colors.bg }}>
          <Ionicons name="add" size={30} color="#fff" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const onboarded = useApp((s) => s.onboarded);
  const insets = useSafeAreaInsets();
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: colors.border, height: 64 + insets.bottom, paddingBottom: insets.bottom, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 15, fontFamily: font.semibold },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMute,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Reply", tabBarIcon: tabIcon("chatbubble-ellipses-outline", "chatbubble-ellipses") }} />
      <Tabs.Screen name="chat" options={{ title: "Chat", tabBarIcon: tabIcon("sparkles-outline", "sparkles") }} />
      <Tabs.Screen name="scan" options={{ title: "", tabBarButton: () => <ScanButton /> }} />
      <Tabs.Screen name="saved" options={{ title: "Saved", tabBarIcon: tabIcon("heart-outline", "heart") }} />
      <Tabs.Screen name="settings" options={{ title: "Me", tabBarIcon: tabIcon("person-circle-outline", "person-circle") }} />
    </Tabs>
  );
}
