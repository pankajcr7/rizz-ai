/** Pick a chat screenshot and turn it into the draft chat on the Reply screen. */
import type { Platform } from "@rizz/shared";
import { api, errorMessage } from "../api/client";
import { toast } from "../components/Toast";
import { useApp } from "../store";
import { useCrushes } from "../store/crushes";
import { pickScreenshot } from "./image";

export async function scanScreenshotToDraft(platformHint?: Platform): Promise<{ ok: boolean; error?: string }> {
  const image = await pickScreenshot();
  if (!image) return { ok: false };
  toast("Reading the screenshot…", "scan-outline");
  try {
    const res = await api.extract({ image, platformHint });
    const messages = res.messages.filter((m) => m.text.trim());
    if (!messages.length) return { ok: false, error: "Couldn't find a chat in that screenshot. Try one that shows the messages." };
    const app = useApp.getState();
    app.setDraftChat(messages);
    app.setDraftMeta({ theirName: res.theirName ?? undefined, platform: res.platform !== "other" ? res.platform : app.platform });
    // Known person? Attach the chat to their crush profile automatically.
    const known = res.theirName ? useCrushes.getState().findByName(res.theirName) : undefined;
    if (known) useCrushes.getState().setActive(known.id);
    toast(`Got ${messages.length} messages ✓`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
