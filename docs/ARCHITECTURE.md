# Rizz AI — Product & Architecture

## 1. Product

**One line:** an AI texting coach that suggests replies to your chats on Instagram, Snapchat, Tinder, Hinge, Bumble, WhatsApp, Messenger and more. It works in 13 tones and 15 languages (including Hinglish, Tanglish and friends), reads the vibe, and teaches you why each reply works.

### Features (all built)

| Feature | What it does | Where |
|---|---|---|
| **Reply suggestions** | Paste a chat, drop a screenshot, or type messages → 3 replies in the chosen tone, goal and boldness | `(tabs)/index.tsx` → `results.tsx`, `POST /v1/suggest` |
| **Vibe check + ghost risk** | Interest 0–100, mood, signals, and how likely they are to ghost (with the reason and a fix) | `components/VibeGauge.tsx`, `vibe.ghost` |
| **Openers** | First messages from their profile screenshot or bio, plus the hooks it noticed | Reply → "Opener", `POST /v1/openers` |
| **Profile review** | Score your OWN profile (up to 3 photos + bio): /10, per-photo tips, top fixes, 3 bio rewrites, optional roast | Reply → "My profile", `POST /v1/profile-review` |
| **Chat: Wingman** | Talk to the AI coach ("she left me on read"); ready-to-send lines | `(tabs)/chat.tsx`, `POST /v1/chat` (`coach`) |
| **Chat: Practice** | The AI plays a fictional match (5 personalities) and scores each message 1–10 with a better version | `POST /v1/chat` (`practice`) |
| **Voice practice** | Mic in Chat: record → Groq Whisper (free) → reply, spoken aloud on-device. Whisper's silence hallucinations are filtered | `POST /v1/transcribe`, `ai/transcribe.ts`, `lib/voice.ts` |
| **Crush profiles** | Memory per person, on device: AI-extracted facts, your notes, vibe and ghost trend, last chat. Facts are sent as `memory` so replies can call back | `store/crushes.ts`, `app/crush/[id].tsx` |
| **Nudges** | Local notification after 24h if they're waiting on you | `lib/nudges.ts` |
| **Date planner** | When the vibe is ≥55%: 3 ideas for your city, budget and vibe, each with the exact "ask" message. Names kinds of places, never invented businesses | `app/date.tsx`, `POST /v1/date-plan` |
| **Rizz Keyboard (Android)** | QWERTY keyboard with a ✨ bar: copy their message → ✨ → tap a reply to type it; or ✨ polishes your draft | `RizzKeyboardService.kt`, `app/keyboard.tsx` |
| **Smart notifications (Android)** | A new message from an app you switched on → "✨ Get replies" → "Send 1/2/3" through that app's quick-reply (or copy) | `SmartNotifications.kt`, `app/notifications.tsx` |
| **Live bubble (Android)** | Floating ✨ over any chat; captures the screen once on tap, OCRs it on-device, shows replies in an overlay | `BubbleService.kt`, `ChatOcr.kt`, `lib/liveBridge.ts` |
| **Share cards** | 9:16 story images (vibe %, practice score, profile score) carrying your invite code — the viral loop | `components/ShareCard.tsx`, `app/share.tsx` |
| **Referrals** | 6-character code; a friend redeems it and you both get 7 days of Pro (referrer rewarded for their first 10) | `POST /v1/referral/redeem`, Me → Invite |
| **Streaks, XP, challenges** | Rookie → Rizz God, daily streak, and 3 weekly challenges from a pool of 10 | `shared/progress.ts`, `app/progress.tsx` |
| **Languages** | Auto, English, Hinglish, Hindi, Tanglish, Tenglish, Kanglish, Manglish, Benglish, Punglish, Spanish, Portuguese, French, German, Arabic — each with a style guide | `LanguageSchema`, `LANGUAGE_GUIDE` |
| **Freemium** | 10 replies, 30 chat messages and 25 screenshot reads per day free; Pro unlimited via RevenueCat | `plans/quota.ts`, `app/paywall.tsx` |

### Design system
Based on current rizz/dating-assistant apps (RIZZ, Plug AI, YourMove) plus Hinge and ChatGPT:
- **One hero input** (screenshot drop zone → paste → type). All settings sit behind a single **Vibe** pill row and sheet (tone, 🌶 boldness 1–5, goal, language, app).
- **Tone switching happens on Results**, which regenerate in place. Loading uses skeletons; reply cards animate in one by one; copying shows a toast.
- **4 tabs plus a centre + button** (Reply · Chat · + · Saved · Me). The + jumps straight to the screenshot picker.
- **Visuals:** near-black warm surfaces (`#0B0A0F` / `#15131C`), one hot pink for actions (`#FF3D7F`), and a pink→coral→amber gradient only for hero moments. Violet (`#8B7CFF`) is reserved for coaching. Plus Jakarta Sans, Ionicons, and glow only on the primary button.

### Roadmap (not built yet)
1. **iOS Rizz Keyboard** (keyboard extension target via a config plugin)
2. **iOS Share Extension**: share a screenshot straight from Photos
3. **Server-side personalisation** (opt-in): learn your style from the replies you pick

---

## 2. System architecture

```
┌────────────────────────────── Phone ──────────────────────────────┐
│  Instagram / WhatsApp / Tinder …                                  │
│     ▲ overlay      ▲ keyboard (IME)      ▲ notification listener  │
│  ┌──┴──────────────┴─────────────────────┴──── Android only ───┐   │
│  │ BubbleService · RizzKeyboardService · RizzNotificationListener│  │
│  │   (call the API themselves with the token from KeyboardConfig)│  │
│  └──────────────────────────┬───────────────────────────────────┘   │
│  ┌──────────────────────────▼───────────────────────────────────┐   │
│  │ React Native app (Expo Router)                                │   │
│  │  screens · zustand stores (prefs, history, crushes, progress │   │
│  │  — all on-device) · api client (device token, timeouts)      │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
└─────────────────────────────┼──────────────────────────────────────┘
                              │ HTTPS (Bearer device token)
┌─────────────────────────────▼──────────────────────────────────────┐
│ Backend: Node + Fastify (Render)                                   │
│  zod validation (shared/contract.ts) · guardrails (minor block,    │
│  "no means no", PII redaction) · quotas · rate limits · referrals  │
│  RevenueCat webhook                                                │
│         │                             │                            │
│         ▼                             ▼                            │
│  AI providers (ai/providers.ts)     Postgres (Neon): usage,        │
│  Groq (default, free) · Gemini ·    entitlements, referrals        │
│  OpenRouter · Claude · custom       — never chats                  │
│  + Groq Whisper for voice                                          │
└────────────────────────────────────────────────────────────────────┘
```

### Why these choices
- **React Native + Expo**: one codebase for iOS and Android, with native Kotlin only where the OS requires it (overlay, keyboard, notification listener). EAS builds in the cloud, so you don't need Android Studio.
- **The backend holds the AI keys**: keys shipped inside an app get extracted. The backend also enforces quota, safety and billing.
- **Pluggable AI** (`ai/providers.ts`): Groq's free tier is the default (no card, fast, no data retention by default). Gemini is the optional fallback; its free tier may train on data, so use test data only. Claude is the paid, highest-quality option. Groq, Gemini and OpenRouter share one OpenAI-compatible client: JSON mode, the schema in the prompt, zod validation, and one corrective retry.
- **Store-safe "live" features**: Google Play rejects apps that use `AccessibilityService` to read chats, so live help comes from three sanctioned APIs instead: MediaProjection (tap to capture), an input method (keyboard), and a NotificationListener (opt-in per app). Each needs explicit user setup.
- **Privacy by design**: chats, crush memory, history and progress live only on the phone. The server stores only counters, Pro state and referral codes. Phone numbers and emails are redacted before any AI call. Logs never contain request bodies or tokens.
- **Frozen system prompts**: the per-request data goes in the user turn, so prompt caching works (Claude) and prompts stay auditable.

---

## 3. Repository structure

```
ai-rizz/
├── package.json            npm workspaces: shared, backend, mobile (react/typescript/zod pinned via overrides)
├── render.yaml             Render blueprint (backend + HTTPS)
├── docs/                   ARCHITECTURE.md (this) · DEPLOY.md
├── shared/                 used by both sides
│   ├── contract.ts         zod schemas + types for every endpoint, tones, languages, personas
│   ├── parseChat.ts        pasted text / WhatsApp export → messages
│   └── progress.ts         XP, levels, streaks, weekly challenges (pure functions)
├── backend/
│   ├── src/
│   │   ├── server.ts       env → AI provider, storage (Postgres or memory), transcriber; graceful shutdown
│   │   ├── app.ts          Fastify, CORS, rate limit, proxy trust, error mapping
│   │   ├── routes/v1.ts    session · me · suggest · openers · extract · chat · profile-review · date-plan ·
│   │   │                   transcribe · referral/redeem · webhooks/revenuecat
│   │   ├── ai/             prompts · schemas · providers (fallback) · claude · openaiCompat · transcribe ·
│   │   │                   chatShared · profileShared · dateShared · safetyFlags
│   │   ├── safety/         guardrails (minors, not-interested) · redact (phones, emails)
│   │   └── plans/          auth (HMAC device tokens) · quota (memory) · referrals (memory) · postgres (all stores)
│   └── test/               129 tests (vitest); store tests run on memory AND real Postgres (PGlite)
└── mobile/
    ├── app.json · app.config.js · eas.json
    ├── src/
    │   ├── theme.ts        design tokens
    │   ├── app/            Expo Router: (tabs)/ Reply · Chat · [+] · Saved · Me — plus results, date, crush/[id],
    │   │                   progress, share, paywall, onboarding, keyboard, notifications, live
    │   ├── components/     ui kit, Sheet, Toast, Skeleton, VibeGauge, ReplyCard, ToneStrip, Vibe, Crush,
    │   │                   ChatPreview, ShareCard, Glow
    │   ├── store/          index (prefs/history/chats) · crushes · progress · session (results job) · drafts · share
    │   ├── api/client.ts   typed client, token refresh, 60s timeouts, friendly errors
    │   └── lib/            liveBridge · keyboardSync · nudges · voice · scan · image · invite · secureStorage · options
    └── modules/rizz-overlay/  local Expo module (Android, Kotlin)
        └── android/…/rizzoverlay/  RizzOverlayModule · BubbleService · ScreenCapturer · ChatOcr ·
                                     RizzKeyboardService · KeyboardConfig · SmartNotifications
```

---

## 4. Key flows

**Reply:** input (screenshot / paste / type) + optional crush → `/v1/suggest` with the tone, goal, prefs and crush `memory` → Results: gauge, ghost risk, date CTA, reply cards. **Sent it** appends the reply to the chat, updates the crush, and cancels the nudge.

**Keyboard (Android):** the user copies their message → ✨ → the IME reads the clipboard (allowed for the active keyboard) and the draft before the cursor → `/v1/suggest` → chips → tap commits the text. It never sends.

**Smart notifications (Android):** a message notification arrives from an enabled app → the listener stores the title, text and the app's RemoteInput reply action (in memory) → posts "✨ Reply to X". **Get replies** → `/v1/suggest` → "Send 1/2/3" → fills the app's RemoteInput and fires its reply intent (or copies).

**Live bubble (Android):** MediaProjection consent → foreground service → a tap grabs one frame → ML Kit OCR → me/them by bubble alignment → `/v1/suggest` → overlay panel.

**Voice:** expo-audio records (m4a on phones, webm on web) → `/v1/transcribe` (Groq Whisper, charged to the chat allowance) → sent as a chat turn → the reply is spoken with expo-speech.

---

## 5. Safety, privacy & policy

| Rule | Enforcement |
|---|---|
| **No minors** | A deterministic check on every chat, note, draft, bio and memory returns `403 blocked_minor` before any AI call. The model can also flag `possible_minor`, which empties the output |
| **No means no** | "stop texting me" / "not interested" force `not_interested`; only graceful exits are offered. The model can escalate a flag, never clear it |
| **No manipulation** | Prompts forbid pressure, guilt-tripping, negging, threats and explicit content, and flag the user if *they* are being pushy |
| **Prompt injection** | Chats are fenced in tags and treated as data |
| **PII** | Phone numbers and emails are redacted before prompts; memory facts drop contact details and sensitive categories |
| **Storage** | Chats, crushes, history and progress stay on the device; "Delete all my data" wipes them |
| **User control** | The keyboard reads only on ✨; notifications are processed only on "Get replies"; nothing is ever sent without a tap |
| **18+** | Onboarding age gate + respect pledge |

---

## 6. Launch checklist

- [x] Free AI provider (Groq) with fallback; voice via Groq Whisper
- [x] **Postgres** for quotas, Pro and referrals (`DATABASE_URL`). Tested on real Postgres and across restarts
- [x] **HTTPS deploy** config: `render.yaml` + [DEPLOY.md](DEPLOY.md) (Neon + Render free tier); proxy trust on in production
- [ ] **Deploy it**: follow DEPLOY.md (needs your GitHub / Neon / Render accounts)
- [ ] **First EAS Android build**: compiles the Kotlin (live bubble, keyboard, smart notifications) for the first time; then test on real phones
- [ ] **Device attestation** on `/v1/session` (Play Integrity / App Attest) to stop free-quota farming across IPs
- [ ] **RevenueCat** products + webhook (DEPLOY.md §5)
- [ ] **Play Console**: declarations for the keyboard, notification listener and screen capture; privacy policy; Data Safety form
- [ ] **App icon, splash, store screenshots** (template assets are still in `mobile/assets`)
- [ ] **Paid Render plan** before launch (the free tier sleeps after 15 min idle)
- [ ] **Eval set** of real (consented) chats to tune prompts per language
