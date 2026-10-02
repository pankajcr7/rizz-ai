import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { IconName } from "../../components/ui";
import { useApp } from "../../store";
import { colors, font } from "../../theme";

function tabIcon(outline: IconName, filled: IconName) {
  function TabIcon({ focused }: { focused: boolean }) {
    return <View style={{ width: 54, height: 32, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: focused ? colors.lime : "transparent" }}>
      <Ionicons name={focused ? filled : outline} size={23} color={focused ? colors.bg : colors.textDim} />
    </View>;
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
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          height: 78 + insets.bottom,
          paddingBottom: insets.bottom + 3,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 16, fontFamily: font.bold },
        tabBarIconStyle: { height: 32, marginBottom: 4 },
        tabBarActiveTintColor: colors.lime,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Chat Help", tabBarIcon: tabIcon("chatbubbles-outline", "chatbubbles") }} />
      <Tabs.Screen name="openers" options={{ title: "Openers", tabBarIcon: tabIcon("bulb-outline", "bulb") }} />
      <Tabs.Screen name="chat" options={{ title: "Coach", tabBarIcon: tabIcon("bar-chart-outline", "bar-chart") }} />
      <Tabs.Screen name="scan" options={{ href: null }} />
      <Tabs.Screen name="saved" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ title: "Profile", tabBarIcon: tabIcon("person-outline", "person") }} />
    </Tabs>
  );
}
