import * as ImagePicker from "expo-image-picker";
import type { ImageInput } from "@rizz/shared";

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Pick a screenshot from the gallery as base64. Returns null if cancelled. */
export async function pickScreenshot(): Promise<ImageInput | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    base64: true,
    quality: 0.6, // plenty for reading text, keeps uploads small
    allowsEditing: false,
  });
  const asset = res.canceled ? undefined : res.assets[0];
  if (!asset?.base64) return null;
  const mediaType = asset.mimeType && SUPPORTED.has(asset.mimeType) ? asset.mimeType : "image/jpeg";
  return { mediaType: mediaType as ImageInput["mediaType"], data: asset.base64 };
}
