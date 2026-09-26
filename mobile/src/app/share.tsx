import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { Platform, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { ShareCard } from "../components/ShareCard";
import { toast } from "../components/Toast";
import { Button, EmptyState, Header, IconButton, Notice, Screen, T } from "../components/ui";
import { inviteText } from "../lib/invite";
import { useApp } from "../store";
import { useProgress } from "../store/progress";
import { useShare } from "../store/share";
import { colors, space } from "../theme";

export default function Share() {
  const card = useShare((s) => s.card);
  const code = useApp((s) => s.referral?.code);
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const back = <IconButton name="close" label="Close" onPress={() => router.back()} filled style={{ marginLeft: -4 }} />;

  if (!card) {
    return (
      <Screen>
        <Header title="Share" left={back} />
        <EmptyState icon="share-social-outline" title="Nothing to share yet" body="Get replies or a profile score first." />
      </Screen>
    );
  }

  const shareImage = async () => {
    setError(undefined);
    setBusy(true);
    try {
      if (Platform.OS === "web") {
        const dataUri = await captureRef(ref, { format: "png", quality: 1, result: "data-uri" });
        const blob = await (await fetch(dataUri)).blob();
        const file = new File([blob], "rizz-ai.png", { type: "image/png" });
        const nav = globalThis.navigator as Navigator & { canShare?: (d: object) => boolean };
        const download = () => {
          const a = document.createElement("a");
          a.href = dataUri;
          a.download = "rizz-ai.png";
          a.click();
          toast("Image downloaded");
        };
        if (nav.canShare?.({ files: [file] })) {
          try {
            await nav.share({ files: [file], text: inviteText(code) });
            useProgress.getState().award("share");
          } catch (err) {
            // User closed the share sheet → do nothing; sharing unsupported/blocked → download instead.
            if ((err as Error).name !== "AbortError") download();
          }
        } else {
          download(); // desktop browsers without file sharing
        }
      } else {
        const uri = await captureRef(ref, { format: "png", quality: 1, result: "tmpfile", width: 1080, height: 1920 });
        if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device");
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your Rizz AI card" });
        useProgress.getState().award("share");
      }
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/abort|cancel/i.test(msg)) setError("Couldn't create the image. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    await Clipboard.setStringAsync(inviteText(code));
    toast("Invite copied — paste it anywhere");
  };

  return (
    <Screen
      footer={
        <View style={{ gap: space(3) }}>
          <Button title="Share image" icon="share-social" loading={busy} onPress={shareImage} />
          <Button title="Copy invite message" icon="copy-outline" variant="secondary" size="md" onPress={copyInvite} />
        </View>
      }
    >
      <Header title="Share your card" subtitle="Post it to your story — your code gets friends 7 days of Pro" left={back} />
      {error ? <Notice text={error} /> : null}
      <View style={{ alignItems: "center", marginBottom: space(4) }}>
        <ShareCard ref={ref} card={card} code={code} />
      </View>
      <T v="small" color={colors.textMute} style={{ textAlign: "center" }}>
        Only what’s on the card is shared — never your chats.
      </T>
    </Screen>
  );
}
