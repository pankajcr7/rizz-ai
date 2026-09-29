/**
 * High-contrast social visual system: near-black, neon lime and hot pink.
 */
import { Platform } from "react-native";

export const colors = {
  bg: "#0B0B0C",
  surface: "#19191B",
  surface2: "#202023",
  surface3: "#2B2B2F",
  border: "#2E2E32",
  borderStrong: "#45454A",

  text: "#FFFFFF",
  textDim: "#B4B4B9",
  textMute: "#89898F",

  lime: "#D5FF63",
  pink: "#FF3EAD",
  accent: "#D5FF63",
  accentSoft: "rgba(213,255,99,0.16)",
  coral: "#FF3EAD",
  amber: "#D5FF63",
  info: "#8CB8FF",
  infoSoft: "rgba(140,184,255,0.14)",

  success: "#D5FF63",
  successSoft: "rgba(213,255,99,0.14)",
  warn: "#E9C36A",
  danger: "#F26A72",
  dangerBg: "rgba(242,106,114,0.12)",

  meBubble: "#FF3EAD",
  themBubble: "#2B2B2F",

  purple: "#8CB8FF",
  gold: "#D5FF63",
};

export const gradient = {
  brand: ["#D5FF63", "#BBF446"] as const,
  brandSoft: ["rgba(213,255,99,0.18)", "rgba(255,62,173,0.08)"] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

export const radius = { xs: 9, sm: 14, md: 20, lg: 26, xl: 34, pill: 999 };
export const space = (n: number) => n * 4;

export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
};

export const type = {
  display: { fontFamily: font.extrabold, fontSize: 38, lineHeight: 43, letterSpacing: -1.3 },
  title: { fontFamily: font.extrabold, fontSize: 25, lineHeight: 31, letterSpacing: -0.7 },
  headline: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
  reply: { fontFamily: font.extrabold, fontSize: 23, lineHeight: 29, letterSpacing: -0.35 },
  small: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.bold, fontSize: 12, lineHeight: 17, letterSpacing: 1.0, textTransform: "uppercase" as const },
};

export const GUTTER = 20;

export const glow = Platform.select({
  web: { boxShadow: "0 12px 28px rgba(0,0,0,0.34)" } as object,
  default: { shadowColor: "#000000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
});
