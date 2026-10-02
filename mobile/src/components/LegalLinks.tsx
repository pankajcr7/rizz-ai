import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { colors, space } from "../theme";
import { T } from "./ui";

export function LegalLinks() {
  return <View style={{ flexDirection: "row", justifyContent: "center", gap: space(5), marginVertical: space(4) }}>
    <Pressable accessibilityRole="link" onPress={() => router.push("/privacy")}><T v="small" color={colors.lime}>Privacy policy</T></Pressable>
    <Pressable accessibilityRole="link" onPress={() => router.push("/terms")}><T v="small" color={colors.lime}>Terms of use</T></Pressable>
  </View>;
}
