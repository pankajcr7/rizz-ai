import { NativeModule, requireOptionalNativeModule } from "expo";

import type { CapturedChat, PanelAction, PanelState, RizzOverlayModuleEvents } from "./RizzOverlay.types";

declare class RizzOverlayNative extends NativeModule<RizzOverlayModuleEvents> {
  isSupported(): boolean;
  hasOverlayPermission(): boolean;
  openOverlaySettings(): void;
  isBubbleRunning(): boolean;
  startBubble(): Promise<boolean>;
  stopBubble(): void;
  showPanel(json: string): boolean;
  hidePanel(): void;
  setKeyboardConfig(json: string): void;
  isKeyboardEnabled(): boolean;
  isKeyboardSelected(): boolean;
  openKeyboardSettings(): void;
  showKeyboardPicker(): void;
  hasNotificationAccess(): boolean;
  openNotificationAccessSettings(): void;
  getSmartApps(): string;
  setSmartApps(json: string): void;
  getSmartCaptureTarget(): string;
  getPendingSmartChat(): string;
  openPendingSmartChat(): boolean;
  saveSmartConversation(platform: string, name: string, json: string, complete: boolean): void;
  clearSmartConversations(): void;
}

// Android-only. On iOS (and in Expo Go) this is null and live mode is hidden.
const native = requireOptionalNativeModule<RizzOverlayNative>("RizzOverlay");

export const RizzOverlay = {
  available: !!native && native.isSupported(),
  hasOverlayPermission: () => native?.hasOverlayPermission() ?? false,
  openOverlaySettings: () => native?.openOverlaySettings(),
  isRunning: () => native?.isBubbleRunning() ?? false,
  start: async () => (native ? native.startBubble() : false),
  stop: () => native?.stopBubble(),
  showPanel: (state: PanelState) => native?.showPanel(JSON.stringify(state)) ?? false,
  hidePanel: () => native?.hidePanel(),

  keyboard: {
    setConfig: (c: { apiUrl: string; token: string; tone: string; language: string; boldness: number }) => native?.setKeyboardConfig(JSON.stringify(c)),
    isEnabled: () => native?.isKeyboardEnabled() ?? false,
    isSelected: () => native?.isKeyboardSelected() ?? false,
    openSettings: () => native?.openKeyboardSettings(),
    showPicker: () => native?.showKeyboardPicker(),
  },

  smart: {
    hasAccess: () => native?.hasNotificationAccess() ?? false,
    openAccessSettings: () => native?.openNotificationAccessSettings(),
    apps: (): { pkg: string; name: string; enabled: boolean }[] => (native ? JSON.parse(native.getSmartApps()) : []),
    setApps: (pkgs: string[]) => native?.setSmartApps(JSON.stringify(pkgs)),
    captureTarget: (): { name: string; platform: string } | null => {
      const raw = native?.getSmartCaptureTarget();
      return raw ? JSON.parse(raw) : null;
    },
    pendingChat: (): { name: string; platform: string } | null => {
      const raw = native?.getPendingSmartChat();
      return raw ? JSON.parse(raw) : null;
    },
    openPendingChat: () => native?.openPendingSmartChat() ?? false,
    saveConversation: (platform: string, name: string, messages: { from: "me" | "them"; text: string }[], complete = false) => native?.saveSmartConversation(platform, name, JSON.stringify(messages), complete),
    clearConversations: () => native?.clearSmartConversations(),
  },

  onCapture(cb: (chat: CapturedChat) => void) {
    return native?.addListener("onCapture", (e) => cb(JSON.parse(e.json)));
  },
  onToneChange(cb: (tone: string) => void) {
    return native?.addListener("onToneChange", (e) => cb(JSON.parse(e.json).tone));
  },
  onRegenerate(cb: () => void) {
    return native?.addListener("onRegenerate", () => cb());
  },
  onAction(cb: (a: PanelAction) => void) {
    return native?.addListener("onAction", (e) => cb(JSON.parse(e.json)));
  },
  onStopped(cb: () => void) {
    return native?.addListener("onBubbleStopped", () => cb());
  },
};
