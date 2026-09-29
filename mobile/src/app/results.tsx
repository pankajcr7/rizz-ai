import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import type { ChatMessage, ProfileReviewResponse, SuggestResponse } from "@rizz/shared";
import { SwipeReplyCards } from "../components/SwipeReplyCards";
import { ReplyCard } from "../components/ReplyCard";
import { LoadingLines, Skeleton, SkeletonCard } from "../components/Skeleton";
import { ToneStrip } from "../components/ToneStrip";
import { Button, Card, Chip, EmptyState, Header, IconButton, Input, Notice, Screen, Section, T } from "../components/ui";
import { VibeGauge } from "../components/VibeGauge";
import { useApp } from "../store";
import { cancelCrushNudge } from "../lib/nudges";
import { useCrushes } from "../store/crushes";
import { useProfileDraft } from "../store/drafts";
import { useSession } from "../store/session";
import { useShare } from "../store/share";
import { colors, font, radius, space } from "../theme";

const LINES = {
  reply: ["Reading the vibe…", "Checking their energy…", "Cooking up something smooth…", "Adding a little rizz…"],
  opener: ["Studying the profile…", "Finding a hook…", "Writing a first line worth answering…"],
  profile: ["Looking at your photos…", "Reading your bio…", "Being honest (but kind)…", "Writing your glow-up plan…"],
};
const TITLES = { reply: "Reply", opener: "Openers", profile: "Profile review" };
const verdict = (n: number) => (n >= 75 ? "Into you 🔥" : n >= 55 ? "Warming up" : n >= 35 ? "Neutral" : "Cold");
const score10Color = (n: number) => (n >= 7 ? colors.success : n >= 5 ? colors.warn : colors.danger);

export default function Results() {
  const { job, status, reply, opener, profile, error, retone, more, adjust, learnStyle, fillMissing, continueChat } = useSession();
  const { setDraftChat, setReplyDraft, theirName } = useApp();
  const openShare = useShare((s) => s.open);
  const [sentText, setSentText] = useState<string>();
  const [theirReply, setTheirReply] = useState("");
  const [missingDetail, setMissingDetail] = useState("");

  const back = <IconButton name="chevron-back" label="Back" onPress={() => router.back()} filled style={{ marginLeft: -4 }} />;

  if (!job) {
    return (
      <Screen>
        <Header title="Results" left={back} />
        <EmptyState icon="sparkles-outline" title="Nothing here yet" body="Add a chat on the Reply tab and tap Get replies." action={{ label: "Go to Reply", onPress: () => router.replace("/") }} />
      </Screen>
    );
  }

  const kind = job.kind;
  const tone = job.kind === "profile" ? "smooth" : job.req.tone;
  const needsInfo = kind === "reply" && !!reply && (!!reply.missingInfo || reply.suggestions.some((s) => s.text.includes("[fill-in]")));

  // "Sent it": keep the thread here so the user can add the response and continue.
  const onSent = (text: string) => {
    if (job.kind !== "reply") return;
    const next = [...job.req.messages, { from: "me" as const, text }].slice(-60);
    setDraftChat(next);
    setReplyDraft("");
    setSentText(text);
    setTheirReply("");
    if (job.kind === "reply" && job.crushId) {
      useCrushes.getState().markReplied(job.crushId, text);
      void cancelCrushNudge(job.crushId);
    }
  };

  const onContinue = async () => {
    if (!sentText || !theirReply.trim()) return;
    const sent = sentText;
    setSentText(undefined);
    setTheirReply("");
    await continueChat(sent, theirReply);
  };

  const share = () => {
    if (kind === "reply" && reply) {
      openShare({ kind: "vibe", interest: reply.vibe.interest, verdict: verdict(reply.vibe.interest), line: reply.suggestions[0]?.text ?? "", theirName });
    } else if (kind === "profile" && profile) {
      openShare({ kind: "profile", score: profile.score, firstImpression: profile.firstImpression, topFix: profile.fixes[0] });
    } else return;
    router.push("/share");
  };
  const canShare = status === "done" && (kind === "reply" ? !!reply : kind === "profile" ? !!profile && profile.safety.flag !== "possible_minor" : false);

  return (
    <Screen
      footer={
        status === "done" ? (
          <View style={{ flexDirection: "row", gap: space(3) }}>
            {kind !== "profile" ? <Button title={kind === "reply" ? "More like this" : "More openers"} icon="refresh" variant="secondary" onPress={() => void more()} style={{ flex: 1 }} /> : null}
            {canShare ? <Button title={kind === "profile" ? "Share my score" : "Share"} icon="share-social" onPress={share} style={{ flex: 1 }} /> : null}
          </View>
        ) : undefined
      }
    >
      <Header title={TITLES[kind]} subtitle={kind === "profile" ? "Honest, specific, fixable" : "Tap a line to copy it"} left={back} />

      {kind !== "profile" ? (
        <Section title="Tone · tap to switch">
          <ToneStrip value={tone} onChange={(t) => void retone(t)} />
        </Section>
      ) : null}

      {status === "loading" ? (
        <View>
          <LoadingLines lines={LINES[kind]} />
          {kind !== "opener" ? (
            <View style={styles.skeletonHero}>
              <Skeleton width={180} height={90} style={{ borderRadius: 90 }} />
              <Skeleton width="70%" height={12} />
            </View>
          ) : null}
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}

      {status === "error" && error ? (
        error.quota ? (
          <Card style={{ alignItems: "center", paddingVertical: space(8) }}>
            <T style={{ fontSize: 40 }}>🔥</T>
            <T v="headline" style={{ marginTop: space(2) }}>
              You’re out of free replies
            </T>
            <T v="small" color={colors.textDim} style={{ textAlign: "center", marginTop: space(1), marginBottom: space(5) }}>
              They reset at midnight — or invite a friend for 7 days of Pro.
            </T>
            <Button title="Go Pro" icon="diamond" onPress={() => router.push("/paywall")} style={{ alignSelf: "stretch" }} />
            <Button title="Invite a friend" icon="gift-outline" variant="ghost" onPress={() => router.navigate("/settings")} style={{ alignSelf: "stretch", marginTop: space(2) }} />
          </Card>
        ) : (
          <View>
            <Notice text={error.message} />
            <Button title="Try again" icon="refresh" variant="secondary" onPress={() => void more()} />
          </View>
        )
      ) : null}

      {status === "done" && kind === "reply" && reply ? (
        <View>
          {reply.safety.flag !== "none" ? <Notice text={reply.safety.message} tone="warn" /> : null}
          <NextMoveCard reply={reply} messages={job.req.messages} />
          <View style={{ marginBottom: space(3) }}>
            <VibeGauge vibe={reply.vibe} />
          </View>
          {reply.vibe.ghost ? <GhostCard ghost={reply.vibe.ghost} /> : null}
          {reply.vibe.interest >= 55 ? (
            <Card onPress={() => router.push({ pathname: "/date", params: job.crushId ? { crushId: job.crushId } : {} })} style={styles.dateCta}>
              <T style={{ fontSize: 26 }}>📅</T>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">The vibe is good — ask them out?</T>
                <T v="small" color={colors.textDim}>
                  3 date ideas + the exact message to send
                </T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMute} />
            </Card>
          ) : null}
          <View style={{ height: space(2) }} />
          {needsInfo ? (
            <Card style={{ marginBottom: space(4), borderColor: colors.warn }}>
              <T v="bodyStrong">One detail is missing</T>
              <T v="small" color={colors.textDim} style={{ marginTop: space(1), marginBottom: space(3) }}>
                {reply.missingInfo?.prompt || "Add the personal detail needed to answer them. Rizz AI won’t invent it."}
              </T>
              <Input value={missingDetail} onChangeText={setMissingDetail} placeholder="Type the real detail…" maxLength={300} />
              <Button title="Use this detail" icon="sparkles" size="md" disabled={!missingDetail.trim()} onPress={() => void fillMissing(missingDetail)} style={{ marginTop: space(2) }} />
            </Card>
          ) : (
            <>
              <Section title="Three ways to say it">
                <SwipeReplyCards items={reply.suggestions} tone={tone} onSent={onSent} />
              </Section>
              <Section title="Adjust this reply">
                <View style={styles.wrap}>
                  <Chip label="Shorter" icon="contract-outline" onPress={() => void adjust("shorter")} />
                  <Chip label="Less flirty" icon="remove-circle-outline" onPress={() => void adjust("less_flirty")} />
                  <Chip label="More casual" icon="chatbubble-outline" onPress={() => void adjust("more_casual")} />
                  <Chip label="More Hindi" icon="language-outline" onPress={() => void adjust("more_hindi")} />
                </View>
              </Section>
              <Section title="Not your style? Teach it">
                <View style={styles.wrap}>
                  <Chip label="Too cheesy" onPress={() => void learnStyle("too_cheesy")} />
                  <Chip label="Too formal" onPress={() => void learnStyle("too_formal")} />
                  <Chip label="Too flirty" onPress={() => void learnStyle("too_flirty")} />
                  <Chip label="Too long" onPress={() => void learnStyle("too_long")} />
                  <Chip label="Missed the point" onPress={() => void learnStyle("missed_point")} />
                </View>
                <T v="small" color={colors.textMute} style={{ marginTop: space(2) }}>
                  Your choice is remembered on this phone and used on future replies.
                </T>
              </Section>
            </>
          )}
          {sentText ? (
            <Card style={{ marginBottom: space(4), borderColor: colors.success }}>
              <T v="caption" color={colors.success}>SENT</T>
              <T v="bodyStrong" style={{ marginTop: space(1) }}>{sentText}</T>
              <T v="small" color={colors.textDim} style={{ marginTop: space(4), marginBottom: space(2) }}>
                They replied? Add it here and keep going with the same conversation.
              </T>
              <Input multiline value={theirReply} onChangeText={setTheirReply} placeholder="Paste or type their reply…" maxLength={1000} style={{ minHeight: 82 }} />
              <Button title="Continue conversation" icon="arrow-forward" size="md" disabled={!theirReply.trim()} onPress={() => void onContinue()} style={{ marginTop: space(2) }} />
            </Card>
          ) : null}
          {reply.coachTip ? <Notice text={reply.coachTip} tone="info" icon="bulb-outline" /> : null}
        </View>
      ) : null}

      {status === "done" && kind === "opener" && opener ? (
        <View>
          {opener.safety.flag !== "none" ? <Notice text={opener.safety.message} tone="warn" /> : null}
          {opener.hooks.length ? (
            <Section title="Hooks found">
              <View style={styles.wrap}>
                {opener.hooks.map((h) => (
                  <View key={h} style={[styles.pill, { backgroundColor: colors.infoSoft }]}>
                    <T v="small" color={colors.info}>
                      {h}
                    </T>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}
          <Section title="Openers">
            <SwipeReplyCards items={opener.openers} tone={tone} />
          </Section>
        </View>
      ) : null}

      {status === "done" && kind === "profile" && profile ? <ProfileResult r={profile} /> : null}
    </Screen>
  );
}

function NextMoveCard({ reply, messages }: { reply: SuggestResponse; messages: ChatMessage[] }) {
  if (reply.missingInfo || reply.suggestions.some((s) => s.text.includes("[fill-in]"))) {
    return <Notice text={`Add one detail first — ${reply.missingInfo?.prompt || "Rizz AI needs a personal fact before it can write a safe answer."}`} tone="info" icon="help-circle-outline" />;
  }
  const last = messages.at(-1);
  const fallback =
    reply.safety.flag === "not_interested" || reply.safety.flag === "uncomfortable"
      ? { action: "end" as const, reason: "They set a boundary, so the useful move is to stop here." }
      : last?.from === "me"
        ? { action: "wait" as const, reason: "Your message is already the latest one in the chat." }
        : { action: "reply" as const, reason: "Their message is the latest one, so a natural reply makes sense." };
  const move = reply.nextMove ?? fallback;
  const config = {
    reply: { title: "Reply", icon: "chatbubble-ellipses-outline" as const, tone: "success" as const },
    wait: { title: "Give it space", icon: "time-outline" as const, tone: "info" as const },
    end: { title: "Stop here", icon: "hand-left-outline" as const, tone: "warn" as const },
  }[move.action];
  return (
    <Notice text={`${config.title} — ${move.reason}`} tone={config.tone} icon={config.icon} />
  );
}

function GhostCard({ ghost }: { ghost: { risk: number; reason: string; fix: string } }) {
  const c = ghost.risk >= 60 ? colors.danger : ghost.risk >= 35 ? colors.warn : colors.success;
  const label = ghost.risk >= 60 ? "High" : ghost.risk >= 35 ? "Medium" : "Low";
  return (
    <Card style={{ marginBottom: space(3) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space(3) }}>
        <T style={{ fontSize: 26 }}>👻</T>
        <View style={{ flex: 1 }}>
          <T v="bodyStrong">
            Conversation risk: <T v="bodyStrong" color={c}>{label}</T>
          </T>
          <T v="small" color={colors.textDim}>
            {ghost.reason}
          </T>
        </View>
      </View>
      {ghost.risk >= 35 ? (
        <View style={styles.ghostFix}>
          <Ionicons name="bulb-outline" size={15} color={colors.info} style={{ marginTop: 2 }} />
          <T v="small" style={{ flex: 1 }}>
            {ghost.fix}
          </T>
        </View>
      ) : null}
    </Card>
  );
}

function ProfileResult({ r }: { r: ProfileReviewResponse }) {
  const images = useProfileDraft((s) => s.images);
  if (r.safety.flag === "possible_minor") return <Notice text={r.safety.message} />;
  return (
    <View>
      <Card style={{ alignItems: "center", paddingVertical: space(6), marginBottom: space(5) }}>
        <T v="caption" color={colors.textMute}>
          Overall
        </T>
        <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: space(1) }}>
          <T style={{ fontFamily: font.extrabold, fontSize: 64, lineHeight: 70, color: score10Color(r.score) }}>{r.score.toFixed(1)}</T>
          <T v="title" color={colors.textDim}>
            {" "}
            /10
          </T>
        </View>
        <T v="body" color={colors.textDim} style={{ textAlign: "center", marginTop: space(2) }}>
          {r.firstImpression}
        </T>
      </Card>

      {r.fixes.length ? (
        <Section title="Top fixes">
          {r.fixes.map((f, i) => (
            <View key={f} style={styles.fix}>
              <View style={styles.fixNum}>
                <T v="small" style={{ fontFamily: font.bold }}>
                  {i + 1}
                </T>
              </View>
              <T v="body" style={{ flex: 1 }}>
                {f}
              </T>
            </View>
          ))}
        </Section>
      ) : null}

      {r.photos.length ? (
        <Section title="Photos">
          {r.photos.map((p) => {
            const img = images[p.index - 1];
            return (
              <Card key={p.index} style={{ flexDirection: "row", gap: space(3), marginBottom: space(3) }}>
                {img ? <Image source={{ uri: `data:${img.mediaType};base64,${img.data}` }} style={styles.thumb} /> : null}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <T v="bodyStrong">Photo {p.index}</T>
                    <T v="bodyStrong" color={score10Color(p.score)}>
                      {p.score.toFixed(1)}
                    </T>
                  </View>
                  <T v="small" color={colors.textDim} style={{ marginTop: 2 }}>
                    {p.verdict}
                  </T>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: space(2) }}>
                    <Ionicons name="bulb-outline" size={14} color={colors.info} style={{ marginTop: 2 }} />
                    <T v="small" style={{ flex: 1 }}>
                      {p.tip}
                    </T>
                  </View>
                </View>
              </Card>
            );
          })}
        </Section>
      ) : null}

      {r.bio ? (
        <Section title={`Bio · ${r.bio.score.toFixed(1)}/10`}>
          <T v="body" color={colors.textDim} style={{ marginBottom: space(3) }}>
            {r.bio.feedback}
          </T>
          {r.bio.rewrites.map((b, i) => (
            <ReplyCard key={b} text={b} why="" tone="smooth" index={i} />
          ))}
        </Section>
      ) : null}

      {r.strengths.length ? (
        <Section title="What's working">
          <View style={styles.wrap}>
            {r.strengths.map((s) => (
              <View key={s} style={[styles.pill, { backgroundColor: colors.successSoft }]}>
                <T v="small" color={colors.success}>
                  ✓ {s}
                </T>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {r.roast ? (
        <Section title="The roast 🔥">
          <Card style={{ borderColor: colors.pink }}>
            <T v="body">{r.roast}</T>
          </Card>
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonHero: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space(4), alignItems: "center", marginBottom: space(5), gap: space(3) },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space(2) },
  pill: { borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1.5) },
  fix: { flexDirection: "row", gap: space(3), alignItems: "flex-start", marginBottom: space(3) },
  fixNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  thumb: { width: 64, height: 86, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  dateCta: { flexDirection: "row", alignItems: "center", gap: space(3), borderColor: colors.pink, marginBottom: space(3) },
  ghostFix: { flexDirection: "row", gap: space(2), marginTop: space(3), padding: space(3), borderRadius: radius.sm, backgroundColor: colors.infoSoft },
});
