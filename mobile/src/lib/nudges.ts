/**
 * "You haven't replied to Priya in a day" reminders — local notifications,
 * scheduled on the device. Nothing goes through our servers.
 */
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const NUDGE_AFTER_S = 24 * 60 * 60;
const supported = Platform.OS !== "web";

let asked = false;
async function allowed(): Promise<boolean> {
  if (!supported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (asked || !current.canAskAgain) return false;
  asked = true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function scheduleCrushNudge(crush: { id: string; name: string }) {
  try {
    if (!(await allowed())) return;
    await Notifications.cancelScheduledNotificationAsync(`nudge-${crush.id}`).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: `nudge-${crush.id}`,
      content: {
        title: `${crush.name} is waiting on you 👀`,
        body: "Don't leave them on read — tap for a reply idea.",
        data: { crushId: crush.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: NUDGE_AFTER_S },
    });
  } catch {
    // notifications unavailable — nudges are a nice-to-have
  }
}

export async function cancelCrushNudge(id: string) {
  if (!supported) return;
  await Notifications.cancelScheduledNotificationAsync(`nudge-${id}`).catch(() => {});
}

/** Show notifications while the app is open, too. Call once at startup. */
export function configureNotifications() {
  if (!supported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}
