/**
 * Design tokens. Everything visual (colours, type, spacing, radii, shadows)
 * comes from here so the whole app stays consistent.
 */
import { Platform } from "react-native";

export const colors = {
  // Surfaces — a deep, slightly warm night palette (not pure black: easier on the eyes, and depth reads better)
  bg: "#0B0A0F",
  surface: "#15131C",
  surface2: "#1E1B28",
  surface3: "#272335",
  border: "#2A2636",
  borderStrong: "#3A3549",

  // Text
  text: "#F5F3F7",
  textDim: "#A8A3B5",
  textMute: "#6E6880",

  // Brand — one hot pink for actions; the warm gradient is for hero moments only
  pink: "#FF3D7F",
  accent: "#FF3D7F",
  accentSoft: "rgba(255,61,127,0.12)",
  coral: "#FF7A59",
  amber: "#FFB547",
  /** Only for coach tips / "the AI is teaching you" moments. */
  info: "#8B7CFF",
  infoSoft: "rgba(139,124,255,0.12)",

  // Semantic
  success: "#34D399",
  successSoft: "rgba(52,211,153,0.12)",
  warn: "#FBBF24",
  danger: "#F43F5E",
  dangerBg: "rgba(244,63,94,0.12)",

  // Chat
  meBubble: "#FF3D7F",
  themBubble: "#221F2D",

  // Aliases
  purple: "#8B7CFF",
  gold: "#FFB547",
};

/** Warm brand gradient (135°): hot pink → coral → amber. Hero, meter, paywall only. */
export const gradient = {
  brand: ["#FF3D7F", "#FF7A59", "#FFB547"] as const,
  brandSoft: ["rgba(255,61,127,0.18)", "rgba(255,122,89,0.14)", "rgba(255,181,71,0.10)"] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};

export const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, pill: 999 };
export const space = (n: number) => n * 4;

export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
};

export const type = {
  display: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },
  title: { fontFamily: font.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3 },
  headline: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: font.medium, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
  reply: { fontFamily: font.semibold, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: "uppercase" as const },
};

/** Screen gutter. */
export const GUTTER = 20;

/** Glow is reserved for the primary CTA and the selected reply card — no drop shadows elsewhere. */
export const glow = Platform.select({
  web: { boxShadow: "0 6px 24px rgba(255,61,127,0.45)" } as object,
  default: { shadowColor: "#FF3D7F", shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
});
