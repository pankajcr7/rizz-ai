import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { DatePlanRequest, DatePlanResponse } from "@rizz/shared";
import { api, errorMessage, RizzApiError } from "../api/client";
import { ReplyCard } from "../components/ReplyCard";
import { LoadingLines, SkeletonCard } from "../components/Skeleton";
import { Button, Card, ChipRow, Header, IconButton, Input, Notice, Screen, Section, T } from "../components/ui";
import { useApp } from "../store";
import { useCrushes } from "../store/crushes";
import { useProgress } from "../store/progress";
import { colors, radius, space } from "../theme";

type Budget = NonNullable<DatePlanRequest["budget"]>;
type Vibe = NonNullable<DatePlanRequest["vibe"]>;

const BUDGETS: { id: Budget; label: string }[] = [
  { id: "low", label: "💸 Cheap" },
  { id: "mid", label: "💳 Normal" },
  { id: "high", label: "💎 Splurge" },
];
const VIBES: { id: Vibe; label: string }[] = [
  { id: "chill", label: "☕ Chill" },
  { id: "fun", label: "🎳 Fun" },
  { id: "romantic", label: "🌙 Romantic" },
  { id: "adventurous", label: "🧗 Adventurous" },
];

export default function DatePlanner() {
  const { crushId } = useLocalSearchParams<{ crushId?: string }>();
  const crush = useCrushes((s) => s.crushes.find((c) => c.id === (crushId ?? s.activeId)));
  const { prefs, draftChat, theirName, city: savedCity, setCity } = useApp();
  const [city, setCityInput] = useState(savedCity);
  const [budget, setBudget] = useState<Budget>("mid");
  const [vibe, setVibe] = useState<Vibe>("fun");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; quota: boolean }>();
  const [plan, setPlan] = useState<DatePlanResponse>();
  const name = crush?.name ?? theirName;
  const back = <IconButton name="chevron-back" label="Back" onPress={() => router.back()} filled style={{ marginLeft: -4 }} />;

  const go = async () => {
    setError(undefined);
    setLoading(true);
    setCity(city.trim());
    try {
      const res = await api.datePlan({
        theirName: name,
        city: city.trim() || undefined,
        budget,
        vibe,
        messages: (crush?.chat.length ? crush.chat : draftChat).slice(-20),
        memory: crush?.facts.length ? crush.facts : undefined,
        prefs,
      });
      setPlan(res);
      if (res.safety.flag === "none") useProgress.getState().award("reply");
      void useApp.getState().refreshMe();
    } catch (e) {
      setError({ message: errorMessage(e), quota: e instanceof RizzApiError && e.code === "quota_exceeded" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen footer={<Button title={plan ? "New ideas" : "Plan the date"} icon={plan ? "refresh" : "calendar"} loading={loading} onPress={go} />}>
      <Header title={name ? `Date with ${name}` : "Plan a date"} subtitle="Ideas they'll say yes to — and how to ask" left={back} />

      <Section title="Where are you?">
        <Input value={city} onChangeText={setCityInput} placeholder="City (optional), e.g. Bengaluru" maxLength={80} autoCapitalize="words" />
      </Section>
      <Section title="Budget">
        <ChipRow options={BUDGETS} value={budget} onChange={setBudget} />
      </Section>
      <Section title="Vibe">
        <ChipRow options={VIBES} value={vibe} onChange={setVibe} />
      </Section>
      {crush?.facts.length ? (
        <Notice tone="info" icon="heart-outline" text={`Using what you know about ${crush.name}: ${crush.facts.slice(0, 3).join(", ")}${crush.facts.length > 3 ? "…" : ""}`} />
      ) : null}

      {error ? (
        error.quota ? (
          <Notice text={error.message} action={{ label: "Go Pro", onPress: () => router.push("/paywall") }} />
        ) : (
          <Notice text={error.message} />
        )
      ) : null}

      {loading ? (
        <View style={{ marginTop: space(2) }}>
          <LoadingLines lines={["Thinking about what they'd love…", "Checking the vibe…", "Writing the ask…"]} />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}

      {plan && !loading ? (
        <View style={{ marginTop: space(2) }}>
          {plan.safety.flag !== "none" ? <Notice text={plan.safety.message} tone="warn" /> : null}
          {plan.ideas.map((idea, i) => (
            <Card key={idea.title} style={{ marginBottom: space(4) }}>
              <View style={{ flexDirection: "row", gap: space(3), alignItems: "flex-start" }}>
                <T style={{ fontSize: 30 }}>{idea.emoji}</T>
                <View style={{ flex: 1 }}>
                  <T v="headline">{idea.title}</T>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2), marginTop: space(1.5) }}>
                    <View style={styles.pill}>
                      <T v="small" color={colors.textDim}>
                        📍 {idea.where}
                      </T>
                    </View>
                    <View style={styles.pill}>
                      <T v="small" color={colors.textDim}>
                        {idea.cost}
                      </T>
                    </View>
                  </View>
                  <T v="small" color={colors.textDim} style={{ marginTop: space(2) }}>
                    {idea.why}
                  </T>
                </View>
              </View>
              <T v="caption" color={colors.pink} style={{ marginTop: space(4), marginBottom: space(2) }}>
                How to ask
              </T>
              <ReplyCard text={idea.ask} why="" tone="confident" index={i} />
            </Card>
          ))}
          {plan.tip ? <Notice tone="info" icon="bulb-outline" text={plan.tip} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: { backgroundColor: colors.surface2, borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: space(1) },
});
