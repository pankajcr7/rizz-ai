import pg from "pg";
import { buildApp } from "./app.js";
import { cleanEnv, createAIFromEnv } from "./ai/providers.js";
import { createGroqTranscriber } from "./ai/transcribe.js";
import { cleanDatabaseUrl, describeDatabaseUrl } from "./plans/dbUrl.js";
import { migrate, PgEntitlements, PgQuota, PgReferrals } from "./plans/postgres.js";
import { CHAT_LIMITS, DAILY_LIMITS, EXTRACT_LIMITS, MemoryEntitlements, MemoryQuota } from "./plans/quota.js";
import { MemoryReferrals } from "./plans/referrals.js";
import { MemoryAccounts, PgAccounts } from "./plans/accounts.js";
import { resendResetMailer } from "./plans/resetMail.js";

const env = cleanEnv(process.env);
const production = env.NODE_ENV === "production";

const tokenSecret = env.TOKEN_SECRET;
if (!tokenSecret || tokenSecret.length < 32) {
  console.error("TOKEN_SECRET must be set to a random string of at least 32 characters");
  process.exit(1);
}

let ai;
try {
  const picked = createAIFromEnv(env);
  ai = picked.ai;
  console.log(`AI provider: ${picked.description}`);
} catch (err) {
  console.error(`❌ ${(err as Error).message}`);
  process.exit(1);
}

// Storage: Postgres when DATABASE_URL is set (production), memory otherwise (local dev).
let pool: pg.Pool | undefined;
let stores;
if (env.DATABASE_URL) {
  let connectionString: string;
  try {
    connectionString = cleanDatabaseUrl(env.DATABASE_URL);
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    process.exit(1);
  }
  pool = new pg.Pool({
    connectionString,
    max: Number(env.DB_POOL_SIZE ?? 5),
    // Neon URLs include channel_binding=require; pg only honours it via this option.
    enableChannelBinding: new URL(connectionString).searchParams.get("channel_binding") === "require",
  });
  try {
    await migrate(pool);
  } catch (err) {
    console.error(`❌ Could not connect to the database at ${describeDatabaseUrl(connectionString)}: ${(err as Error).message}`);
    process.exit(1);
  }
  stores = {
    accounts: new PgAccounts(pool),
    quota: new PgQuota(pool, "reply", DAILY_LIMITS),
    extractQuota: new PgQuota(pool, "extract", EXTRACT_LIMITS),
    chatQuota: new PgQuota(pool, "chat", CHAT_LIMITS),
    entitlements: new PgEntitlements(pool),
    referrals: new PgReferrals(pool),
  };
  console.log(`Storage: Postgres (${describeDatabaseUrl(connectionString)})`);
} else {
  if (production) console.warn("⚠️  No DATABASE_URL in production — quotas, Pro and referrals will reset on every restart.");
  stores = {
    accounts: new MemoryAccounts(),
    quota: new MemoryQuota(),
    extractQuota: new MemoryQuota(EXTRACT_LIMITS),
    chatQuota: new MemoryQuota(CHAT_LIMITS),
    entitlements: new MemoryEntitlements(),
    referrals: new MemoryReferrals(),
  };
  console.log("Storage: in-memory (dev)");
}

const app = await buildApp(
  {
    ai,
    ...stores,
    // Voice practice uses Groq Whisper (free) whenever a Groq key is present, whatever the chat provider.
    transcriber: env.GROQ_API_KEY ? createGroqTranscriber({ apiKey: env.GROQ_API_KEY, model: env.STT_MODEL }) : undefined,
    tokenSecret,
    resetMailer: env.RESEND_API_KEY && env.RESET_EMAIL_FROM ? resendResetMailer(env.RESEND_API_KEY, env.RESET_EMAIL_FROM) : undefined,
    webhookSecret: env.REVENUECAT_WEBHOOK_SECRET,
  },
  {
    logger: true,
    corsOrigins: env.CORS_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
    exemptLoopback: !production,
    // Hosts like Render put a proxy in front; trust it so rate limits see real client IPs.
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === "true" || env.TRUST_PROXY === "1" : production,
  },
);

// Graceful shutdown (hosts send SIGTERM on deploys/restarts).
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, async () => {
    await app.close().catch(() => {});
    await pool?.end().catch(() => {});
    process.exit(0);
  });
}

await app.listen({ port: Number(env.PORT ?? 8787), host: "0.0.0.0" });
