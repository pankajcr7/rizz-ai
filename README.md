# Rizz AI 💬✨

AI texting coach: reply suggestions for Instagram, Snapchat, Tinder, Hinge, Bumble, WhatsApp and more, in 13 tones and 15 languages (Hinglish, Tanglish & co.). Includes a vibe + ghost-risk check, Wingman and Practice chat (with voice), crush memory, a date planner, profile review, share cards and referrals. On Android: the Rizz Keyboard, smart notifications and a live bubble.

Full product spec + architecture: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** · Deploying: **[docs/DEPLOY.md](docs/DEPLOY.md)**

```
shared/   API contract (zod), chat parser, XP/streak rules — used by both sides
backend/  Node + Fastify: AI providers (Groq/Gemini/Claude), safety, quotas, Postgres, referrals, billing webhook
mobile/   Expo React Native app + Android Kotlin module (keyboard, smart notifications, live bubble)
```

## Run it

Requirements: Node 20+. For live mode you also need an Android device/emulator and either Android Studio or an EAS account.

```bash
npm install                       # from the repo root (npm workspaces)
```

### AI provider (free)
The backend works with **Groq (free, default)**, Google Gemini (free), OpenRouter (free models), Claude (paid, best quality), or any OpenAI-compatible API. Set a key in `backend/.env`:

| Provider | Key | Cost | Notes |
|---|---|---|---|
| **Groq** (default) | `GROQ_API_KEY` from console.groq.com/keys | Free, no card | Fast; doesn't store data by default. ~1K requests/day per model |
| Gemini (fallback) | `GEMINI_API_KEY` from aistudio.google.com/apikey | Free, no card | Biggest limits, but free-tier data may be used for training → test data only, or enable billing |
| Claude | `ANTHROPIC_API_KEY` | Paid | Best quality. Set `AI_PROVIDER=claude` |

Add `AI_FALLBACK=gemini` to fall back automatically when Groq is rate-limited. Model ids can be overridden with `AI_TEXT_MODEL` / `AI_VISION_MODEL`.

### Backend
```bash
cd backend
cp .env.example .env              # add GROQ_API_KEY and a TOKEN_SECRET
npm run dev                       # → http://localhost:8787
npm test                          # 129 tests
```

### In the browser (quickest way to try it)
```bash
cd backend && npm run dev         # terminal 1 — needs GROQ_API_KEY in backend/.env
cd mobile && npx expo start --web # terminal 2 — opens http://localhost:8081
```
Everything works except Live mode (Android only), and there are no purchases on web. The web build is for development; the product is the mobile app.

### Mobile
```bash
cd mobile
cp .env.example .env              # EXPO_PUBLIC_API_URL = your backend URL
npx expo run:android              # dev build (needed for live mode's native code)
# or: npx expo start              # Expo Go — everything except live mode
```
On a real phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN IP (e.g. `http://192.168.1.20:8787`). The Android emulator can reach your computer at `10.0.2.2`.

### Checks
```bash
npm test                          # backend + shared tests
npm run typecheck
cd mobile && npx tsc --noEmit && npx expo lint && npx expo-doctor
```
