/**
 * Rizz visual system: restrained, editorial, product-first.
 * One coral action colour, warm type, neutral dark surfaces, violet only for coaching.
 */
import { Platform } from "react-native";

export const colors = {
  bg: "#0A0A0B",
  surface: "#141416",
  surface2: "#1B1B1E",
  surface3: "#222226",
  border: "#2C2C30",
  borderStrong: "#3A3A40",

  text: "#F3EFE8",
  textDim: "#9A999E",
  textMute: "#6F6E73",

  // Coral is the only primary action colour. Keep it rare so actions read instantly.
  pink: "#FF6B5E",
  accent: "#FF6B5E",
  accentSoft: "rgba(255,107,94,0.12)",
  coral: "#FF6B5E",
  amber: "#EEDFCC",
  info: "#8B80FF",
  infoSoft: "rgba(139,128,255,0.12)",

  success: "#83C99C",
  successSoft: "rgba(131,201,156,0.12)",
  warn: "#E9C36A",
  danger: "#F26A72",
  dangerBg: "rgba(242,106,114,0.12)",

  meBubble: "#EEDFCC",
  themBubble: "#222226",

  purple: "#8B80FF",
  gold: "#EEDFCC",
};

// Kept for components that use LinearGradient, but deliberately almost-flat.
export const gradient = {
  brand: ["#FF6B5E", "#FF7468"] as const,
  brandSoft: ["rgba(255,107,94,0.14)", "rgba(238,223,204,0.08)"] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

export const radius = { xs: 8, sm: 12, md: 16, lg: 22, xl: 30, pill: 999 };
export const space = (n: number) => n * 4;

export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
};

export const type = {
  display: { fontFamily: font.semibold, fontSize: 34, lineHeight: 41, letterSpacing: -0.7 },
  title: { fontFamily: font.semibold, fontSize: 23, lineHeight: 30, letterSpacing: -0.35 },
  headline: { fontFamily: font.semibold, fontSize: 17, lineHeight: 23 },
  body: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
  reply: { fontFamily: font.semibold, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 1.1, textTransform: "uppercase" as const },
};

export const GUTTER = 20;

// A restrained lift rather than a neon glow.
export const glow = Platform.select({
  web: { boxShadow: "0 8px 24px rgba(0,0,0,0.24)" } as object,
  default: { shadowColor: "#000000", shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
});
