import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Button, Header, IconButton, Input, Screen, T } from "../components/ui";
import { pickScreenshot } from "../lib/image";
import { useApp } from "../store";
import { useProfileDraft } from "../store/drafts";
import { useSession } from "../store/session";
import { colors, font, radius, space } from "../theme";

export default function ProfileReview() {
  const { images, setImages, bio, setBio, roast, setRoast } = useProfileDraft();
  const { platform, prefs } = useApp();
  const run = useSession((s) => s.run);
  const generate = () => {
    void run({ kind: "profile", req: { platform, images, bio: bio.trim() || undefined, roast, prefs } });
    router.push("/results");
  };
  return <Screen footer={<Button title="Review my profile" icon="sparkles" disabled={!images.length && !bio.trim()} onPress={generate} />}>
    <Header title="Profile glow-up" left={<IconButton name="chevron-back" label="Back" onPress={() => router.back()} />} />
    <T style={styles.hero}>Show your best side.</T>
    <T v="body" color={colors.textDim} style={{ marginBottom: space(6) }}>Add up to 3 photos and your bio. Get honest, specific tips you can use.</T>
    <View style={styles.photos}>{Array.from({ length: 3 }).map((_, i) => {
      const img = images[i];
      return <Pressable key={i} onPress={async () => { if (img) setImages(images.filter((_, j) => j !== i)); else { const picked = await pickScreenshot(); if (picked) setImages([...images, picked].slice(0, 3)); } }} style={styles.slot} accessibilityLabel={img ? `Remove photo ${i + 1}` : `Add photo ${i + 1}`}>
        {img ? <Image source={{ uri: `data:${img.mediaType};base64,${img.data}` }} style={StyleSheet.absoluteFill} /> : <Ionicons name={images.length === i ? "add" : "image-outline"} size={27} color={colors.lime} />}
      </Pressable>;
    })}</View>
    <T v="caption" color={colors.textDim} style={{ marginBottom: space(2) }}>YOUR BIO</T>
    <Input multiline value={bio} onChangeText={setBio} placeholder="Paste your current bio or prompts…" maxLength={2000} style={{ minHeight: 130 }} />
    <Pressable onPress={() => setRoast(!roast)} style={styles.roast}><T style={{ fontSize: 26 }}>🔥</T><View style={{ flex: 1 }}><T v="bodyStrong">Roast me, respectfully</T><T v="small" color={colors.textDim}>A playful extra take with your review</T></View><Ionicons name={roast ? "checkbox" : "square-outline"} size={25} color={colors.pink} /></Pressable>
  </Screen>;
}

const styles = StyleSheet.create({
  hero: { fontFamily: font.extrabold, fontSize: 35, lineHeight: 40, color: colors.text, letterSpacing: -1, marginBottom: space(2) },
  photos: { flexDirection: "row", gap: space(3), marginBottom: space(7) },
  slot: { flex: 1, aspectRatio: 0.74, borderWidth: 2, borderStyle: "dashed", borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  roast: { flexDirection: "row", alignItems: "center", gap: space(3), padding: space(4), borderRadius: radius.lg, backgroundColor: colors.surface, marginTop: space(5) },
});
