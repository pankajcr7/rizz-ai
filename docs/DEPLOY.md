# Deploying Rizz AI (free tier)

**Stack:** Neon (Postgres, free) + Render (backend with HTTPS, free) + EAS (Android build).
It takes about 15 minutes. You need GitHub, Neon and Render accounts; all are free.

```
Phone app ──https──► Render: rizz-ai-api ──► Groq (AI, voice)
                          │
                          └──► Neon Postgres (quotas, Pro, referrals — never chats)
```

---

## 1. Put the code on GitHub

```bash
cd ai-rizz
git init -b main
git add .
git commit -m "Rizz AI"
# create an EMPTY private repo on github.com (no README), then:
git remote add origin https://github.com/<you>/rizz-ai.git
git push -u origin main
```
`.gitignore` already excludes `.env` files and `node_modules`, so your keys stay local.

## 2. Create the database (Neon)

1. Go to https://neon.tech → **New project**. Choose the region closest to your users (e.g. *AWS ap-south-1, Mumbai*).
2. Copy the **connection string**. It looks like
   `postgresql://user:pass@ep-xxx.ap-south-1.aws.neon.tech/neondb?sslmode=require`

You don't need to create any tables. The server creates them on first start.

## 3. Deploy the backend (Render)

1. https://dashboard.render.com → **New → Blueprint** → connect your GitHub → pick the repo.
   Render reads `render.yaml` and creates the **rizz-ai-api** web service.
2. It asks for these values:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from step 2 |
   | `GROQ_API_KEY` | your key from console.groq.com/keys |
   | `GEMINI_API_KEY` | optional |
   | `AI_FALLBACK` | optional, `gemini` |

   `TOKEN_SECRET` and `REVENUECAT_WEBHOOK_SECRET` are generated for you.
3. **Apply.** When the deploy is live, open `https://rizz-ai-api.onrender.com/health` and you should see `{"ok":true}`.
   The log should show `AI provider: groq` and `Storage: Postgres`.

> If the name `rizz-ai-api` was taken, Render adds a suffix. Use the URL Render shows you in step 4.

**Free-tier note:** a free Render service sleeps after 15 minutes idle, and the first request then takes ~30–50 s. The app pings the server on launch, so it's usually awake by the time you tap **Get replies**. Upgrade the service to *Starter* before a real launch.

## 4. Point the app at it

In `mobile/eas.json`, the `production` and `preview-cloud` profiles use
`EXPO_PUBLIC_API_URL=https://rizz-ai-api.onrender.com`. Change it if your Render URL differs.

```bash
cd mobile
npx eas-cli@latest build -p android --profile preview-cloud   # installable APK that uses the live server
npx eas-cli@latest build -p android --profile production      # Play Store build (AAB)
```
Production builds block plain `http://`, so they only talk to the HTTPS server.

## 5. Subscriptions (when you're ready to charge)

1. RevenueCat → create the project and the Play Store app, and add products + an offering.
2. RevenueCat → **Integrations → Webhooks**:
   - URL: `https://rizz-ai-api.onrender.com/v1/webhooks/revenuecat`
   - Authorization header: `Bearer <REVENUECAT_WEBHOOK_SECRET from Render → Environment>`
3. Put the RevenueCat **public** Android key in `mobile/eas.json` as `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.

---

## Environment reference (backend)

| Variable | Required | Notes |
|---|---|---|
| `TOKEN_SECRET` | ✅ | 32+ random chars. Changing it logs every device out (they reconnect automatically) |
| `GROQ_API_KEY` | ✅ (or another provider) | Also enables voice (Whisper) |
| `DATABASE_URL` | ✅ in production | Without it, quotas, Pro and referrals are in memory and reset on restart |
| `NODE_ENV=production` | ✅ | Turns on proxy trust, turns off the localhost rate-limit exemption |
| `AI_PROVIDER`, `AI_FALLBACK`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_TEXT_MODEL`, `AI_VISION_MODEL`, `STT_MODEL` | optional | See `backend/.env.example` |
| `REVENUECAT_WEBHOOK_SECRET` | for payments | |
| `CORS_ORIGINS` | only for a web frontend | Comma-separated |
| `TRUST_PROXY` | optional | Defaults to on in production |
| `DB_POOL_SIZE` | optional | Default 5 |

## What's stored in Postgres

| Table | Contents |
|---|---|
| `usage` | Daily counters per device and feature (rows older than 7 days are deleted on each start) |
| `entitlements` | Pro subscription flag, and Pro-until from referrals |
| `referral_codes`, `referral_redemptions` | Invite codes, and who used which |

No chats, screenshots, voice or names are ever stored on the server.
