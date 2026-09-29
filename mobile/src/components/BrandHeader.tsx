import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, font, space } from "../theme";
import { T } from "./ui";

export function BrandHeader({ subtitle = "Better chats. Brighter dates." }: { subtitle?: string }) {
  return <View style={styles.row}>
    <View style={{ flex: 1 }}>
      <T style={styles.logo}>Rizz <T style={styles.lime}>AI</T></T>
      <T v="small" color={colors.textDim} style={{ marginTop: -4 }}>{subtitle}</T>
    </View>
    <Pressable accessibilityLabel="Streaks and progress" onPress={() => router.push("/progress")} style={styles.action}><Ionicons name="trophy" size={25} color={colors.lime} /></Pressable>
    <Pressable accessibilityLabel="Settings" onPress={() => router.navigate("/settings")} style={styles.action}><Ionicons name="settings-outline" size={25} color={colors.textDim} /></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space(2), paddingTop: space(4), marginBottom: space(6) },
  logo: { fontFamily: font.extrabold, fontSize: 37, letterSpacing: -1.8, color: colors.text },
  lime: { fontFamily: font.extrabold, fontSize: 37, letterSpacing: -1.8, color: colors.lime },
  action: { width: 43, height: 43, alignItems: "center", justifyContent: "center" },
});
