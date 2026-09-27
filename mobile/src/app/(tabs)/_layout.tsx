import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { IconName } from "../../components/ui";
import { useApp } from "../../store";
import { colors, font } from "../../theme";

function tabIcon(outline: IconName, filled: IconName) {
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <Ionicons name={focused ? filled : outline} size={22} color={color as string} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  const onboarded = useApp((s) => s.onboarded);
  const insets = useSafeAreaInsets();
  if (!onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          height: 66 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 7,
        },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 15, fontFamily: font.semibold },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMute,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Reply", tabBarIcon: tabIcon("chatbubble-outline", "chatbubble") }} />
      <Tabs.Screen name="chat" options={{ title: "Wingman", tabBarIcon: tabIcon("happy-outline", "happy") }} />
      <Tabs.Screen name="scan" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ title: "Saved", tabBarIcon: tabIcon("bookmark-outline", "bookmark") }} />
      <Tabs.Screen name="settings" options={{ title: "You", tabBarIcon: tabIcon("person-outline", "person") }} />
    </Tabs>
  );
}
