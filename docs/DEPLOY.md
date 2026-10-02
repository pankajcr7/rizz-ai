# Deploying Rizz AI (free tier)

**Stack:** Neon (Postgres, free) + Render (backend with HTTPS, free) + GitHub Actions (standalone Android APK).
The Android build runs on GitHub’s cloud runners. You need GitHub, Neon and Render accounts; all are free.

```
Phone app ──https──► Render: rizz-ai-api ──► Groq (AI, voice)
                          │
                          └──► Neon Postgres (accounts, quotas, Pro, referrals — never chats)
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
   | `AI_FALLBACK` | blank/`auto` uses configured backups; `none` disables them |
   | `RESEND_API_KEY` | optional, for password recovery |
   | `RESET_EMAIL_FROM` | optional, a sender on a verified Resend domain |

   `TOKEN_SECRET` and `REVENUECAT_WEBHOOK_SECRET` are generated for you.
3. **Apply.** When the deploy is live, open `https://rizz-ai-api.onrender.com/health` and you should see `{"ok":true}`.
   The log should show `AI provider: groq` and `Storage: Postgres`.

> If the name `rizz-ai-api` was taken, Render adds a suffix. Use the URL Render shows you in step 4.

**Free-tier note:** a free Render service sleeps after 15 minutes idle, and the first request then takes ~30–50 s. The app pings the server on launch, so it's usually awake by the time you tap **Get replies**. Upgrade the service to *Starter* before a real launch.

## 4. Point the app at it

The workflow `.github/workflows/standalone-apk.yml` on `codex-updated-ui-apk` installs JDK 17 and the Android SDK on GitHub's Ubuntu runner, generates the Android project, and runs `assembleRelease`. The APK includes its JavaScript bundle and opens directly without Expo or a development server.

Set `EXPO_PUBLIC_API_URL` in both workflow build steps to your HTTPS backend. Push this branch, open GitHub → Actions → **Updated UI Android APK**, wait for success, and download the **rizz-ai-updated-ui-apk** artifact. Unzip it to get `app-release.apk`. Downloading Actions artifacts requires signing into GitHub. No EAS or local Android build tools are needed.

The public policy pages are `https://<your-backend>/privacy` and `/terms`. They share their text with the in-app pages. Review those disclosures against your actual provider setup before publishing the app.

### Account recovery and capacity

Set `RESEND_API_KEY` and `RESET_EMAIL_FROM` in Render's Environment settings, with a sender domain verified in Resend. Reset codes expire in 15 minutes, allow five guesses, are stored only as hashes, and are single-use. Resetting a password revokes existing account sessions. Without the email settings, recovery reports that it is unavailable instead of claiming to have sent an email. Deletion is available under Profile, requires the current password, and removes the account's database records and this device's local app data. Store subscriptions must be cancelled separately.

AI fallback defaults to all configured providers; set `AI_FALLBACK=none` to opt out. Provider-specific model overrides such as `GEMINI_TEXT_MODEL` apply to backups too. The server admits two concurrent AI requests, queues up to twelve briefly, and skips a busy primary for 30 seconds. It sends only the selected language guide and uses smaller output budgets. These measures reduce waste and handle bursts; they do not increase a provider's token quota. Provision paid provider capacity and load-test before a public launch. Gemini's unpaid tier may use submissions for product improvement and human review; enable billing or disable that backup for your intended data-handling policy.

## 5. Subscriptions (when you're ready to charge)

1. RevenueCat → create the project and the Play Store app, and add products + an offering.
2. RevenueCat → **Integrations → Webhooks**:
   - URL: `https://rizz-ai-api.onrender.com/v1/webhooks/revenuecat`
   - Authorization header: `Bearer <REVENUECAT_WEBHOOK_SECRET from Render → Environment>`
3. Set the RevenueCat **public** Android key in the workflow build environment as `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.

---

## Environment reference (backend)

| Variable | Required | Notes |
|---|---|---|
| `TOKEN_SECRET` | ✅ | 32+ random chars. Changing it logs every device out (they reconnect automatically) |
| `GROQ_API_KEY` | ✅ (or another provider) | Also enables voice (Whisper) |
| `DATABASE_URL` | ✅ in production | Without it, quotas, Pro and referrals are in memory and reset on restart |
| `NODE_ENV=production` | ✅ | Turns on proxy trust, turns off the localhost rate-limit exemption |
| `AI_PROVIDER`, `AI_FALLBACK`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `AI_TEXT_MODEL`, `AI_VISION_MODEL`, `STT_MODEL` | optional | See `backend/.env.example` |
| `RESEND_API_KEY`, `RESET_EMAIL_FROM` | for account recovery | Resend API key and verified sender |
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
| `accounts` | Email, salted password hash, account identity and session version |
| `account_resets` | Hashed recovery code, expiry, attempt count and consumption state |

Chat content, screenshots and voice recordings are processed without saving them in our database or application logs. Account emails and usage records are stored as listed above. AI providers have their own retention policies. Daily free limits reset at midnight UTC; the app displays the corresponding local time.
