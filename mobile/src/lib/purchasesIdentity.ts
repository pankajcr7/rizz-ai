import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import { getDeviceId } from "../api/client";

const apiKey = Platform.select({
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
});
let initial: Promise<void> | null = null;

/** Serialize setup and account switches so purchases use the same identity as the API. */
export function initializePurchases(): Promise<void> {
  if (!apiKey) return Promise.resolve();
  initial ??= getDeviceId().then(async (appUserID) => {
    if (!(await Purchases.isConfigured())) Purchases.configure({ apiKey, appUserID });
  }).catch(() => { initial = null; });
  return initial;
}

export async function identifyPurchases(deviceId: string): Promise<void> {
  if (!apiKey) return;
  await initializePurchases();
  if (await Purchases.isConfigured()) await Purchases.logIn(deviceId);
}
