import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, Switch, View } from "react-native";
import { RizzOverlay } from "../../modules/rizz-overlay";
import { Button, Card, Header, IconButton, ListGroup, ListRow, Notice, Screen, Section, T } from "../components/ui";
import { colors, space } from "../theme";

export default function SmartNotificationsSetup() {
  const back = <IconButton name="chevron-back" label="Back" onPress={() => router.back()} filled style={{ marginLeft: -4 }} />;
  const [access, setAccess] = useState(RizzOverlay.smart.hasAccess());
  const [canPost, setCanPost] = useState(true);
  const [apps, setApps] = useState(RizzOverlay.smart.apps());

  const refresh = useCallback(() => {
    setAccess(RizzOverlay.smart.hasAccess());
    setApps(RizzOverlay.smart.apps());
    Notifications.getPermissionsAsync()
      .then((p) => setCanPost(p.granted))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && refresh());
    return () => sub.remove();
  }, [refresh]);
  useFocusEffect(refresh);

  if (!RizzOverlay.available) {
    return (
      <Screen>
        <Header title="Smart notifications" left={back} />
        <Notice tone="info" text="Smart notifications are Android-only — iPhones don't let apps see other apps' notifications." />
      </Screen>
    );
  }

  const toggle = (pkg: string, on: boolean) => {
    const next = apps.map((a) => (a.pkg === pkg ? { ...a, enabled: on } : a));
    setApps(next);
    RizzOverlay.smart.setApps(next.filter((a) => a.enabled).map((a) => a.pkg));
  };

  const anyOn = apps.some((a) => a.enabled);

  return (
    <Screen
      footer={
        !canPost ? (
          <Button title="Allow Rizz AI notifications" icon="notifications-outline" onPress={() => Notifications.requestPermissionsAsync().then(refresh)} />
        ) : !access ? (
          <Button title="Give notification access" icon="settings-outline" onPress={() => RizzOverlay.smart.openAccessSettings()} />
        ) : undefined
      }
    >
      <Header title="Smart notifications" subtitle="Reply ideas the moment they text you" left={back} />

      <Card style={{ marginBottom: space(6) }}>
        <Step n={1} done={canPost} title="Allow Rizz AI notifications" body="So we can show “✨ Get replies”." />
        <Step n={2} done={access} title="Give notification access" body="Settings → Notification access → Rizz AI smart replies." />
        <Step n={3} done={access && anyOn} title="Pick your apps" body="Only the apps you switch on below." last />
      </Card>

      <Section title="Apps">
        <ListGroup>
          {apps.map((a, i) => (
            <ListRow
              key={a.pkg}
              icon="chatbubbles-outline"
              title={a.name}
              last={i === apps.length - 1}
              right={<Switch value={a.enabled} onValueChange={(v) => toggle(a.pkg, v)} trackColor={{ true: colors.pink, false: colors.surface3 }} thumbColor="#fff" />}
            />
          ))}
        </ListGroup>
      </Section>

      <Section title="How it works">
        {[
          ["notifications-outline", "They text you → “✨ Reply to Priya” appears"],
          ["sparkles-outline", "Tap Get replies → 3 ideas right in the notification"],
          ["send-outline", "Tap Send 1/2/3 → it's sent through the app's own quick reply"],
        ].map(([icon, text]) => (
          <View key={text} style={styles.how}>
            <Ionicons name={icon as "sparkles-outline"} size={18} color={colors.pink} />
            <T v="bodyStrong" style={{ flex: 1 }}>
              {text}
            </T>
          </View>
        ))}
      </Section>

      <Notice
        tone="info"
        icon="shield-checkmark-outline"
        text="Nothing leaves your phone until you tap Get replies — then only that one message is sent (with numbers & emails removed). Nothing is ever sent to the chat unless you tap Send."
      />
    </Screen>
  );
}

function Step({ n, done, title, body, last }: { n: number; done: boolean; title: string; body: string; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: space(3), marginBottom: last ? 0 : space(4) }}>
      <View style={[styles.dot, done && { backgroundColor: colors.success }]}>
        {done ? <Ionicons name="checkmark" size={16} color={colors.bg} /> : <T v="bodyStrong">{n}</T>}
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{title}</T>
        <T v="small" color={colors.textDim} style={{ marginTop: 2 }}>
          {body}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  how: { flexDirection: "row", alignItems: "center", gap: space(3), marginBottom: space(3) },
});
