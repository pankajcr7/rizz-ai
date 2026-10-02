import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { buildApp } from "../src/app.js";
import { MemoryAccounts, PgAccounts, type AccountStore } from "../src/plans/accounts.js";
import { migrate, PgEntitlements, PgQuota, PgReferrals, type Db } from "../src/plans/postgres.js";
import { MemoryQuota, MemoryEntitlements } from "../src/plans/quota.js";
import { MemoryReferrals } from "../src/plans/referrals.js";
import type { RizzAI } from "../src/ai/types.js";
import { resendResetMailer } from "../src/plans/resetMail.js";

const DEVICE = "device_aaaaaaaaaaaaaaaa";
const email = "adult@example.com";
const password = "original password here";

describe.each(["memory", "postgres"])("%s account lifecycle", (kind) => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let database: PGlite | undefined;
  let accounts: AccountStore;
  let headers: { authorization: string };
  const delivered: { email: string; code: string }[] = [];
  beforeEach(async () => {
    delivered.length = 0;
    database = kind === "postgres" ? new PGlite() : undefined;
    const db = database as unknown as Db;
    if (database) await migrate(db);
    accounts = database ? new PgAccounts(db) : new MemoryAccounts();
    app = await buildApp({
      ai: {} as RizzAI, accounts, tokenSecret: "s".repeat(32),
      quota: database ? new PgQuota(db, "reply") : new MemoryQuota(),
      extractQuota: database ? new PgQuota(db, "extract") : new MemoryQuota(),
      chatQuota: database ? new PgQuota(db, "chat") : new MemoryQuota(),
      entitlements: database ? new PgEntitlements(db) : new MemoryEntitlements(),
      referrals: database ? new PgReferrals(db) : new MemoryReferrals(),
      resetMailer: async (address, code) => { delivered.push({ email: address, code }); },
    });
    const guest = await app.inject({ method: "POST", url: "/v1/session", payload: { deviceId: DEVICE } });
    const signup = await app.inject({ method: "POST", url: "/v1/account/signup", headers: { authorization: `Bearer ${guest.json().token}` }, payload: { email, password } });
    expect(signup.statusCode).toBe(200);
    headers = { authorization: `Bearer ${signup.json().token}` };
  });
  afterEach(async () => { await app.close(); await database?.close(); });

  it("serves the same privacy and terms disclosures without requiring login", async () => {
    const privacy = await app.inject({ method: "GET", url: "/privacy" });
    const terms = await app.inject({ method: "GET", url: "/terms" });
    expect(privacy.statusCode).toBe(200);
    expect(privacy.headers["content-type"]).toContain("text/html");
    expect(privacy.body).toContain("unpaid Google Gemini service");
    expect(terms.body).toContain("midnight UTC");
  });

  it("allows only one simultaneous use of a reset code", async () => {
    await app.inject({ method: "POST", url: "/v1/account/password-reset/request", payload: { email } });
    const payload = { email, code: delivered[0]!.code, password: "a new strong password" };
    const results = await Promise.all([0, 1].map(() => app.inject({ method: "POST", url: "/v1/account/password-reset/confirm", payload })));
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 400]);
  });

  it("uses a one-time email code and revokes old sessions after reset", async () => {
    const known = await app.inject({ method: "POST", url: "/v1/account/password-reset/request", payload: { email } });
    const unknown = await app.inject({ method: "POST", url: "/v1/account/password-reset/request", payload: { email: "unknown@example.com" } });
    expect(known.json()).toEqual(unknown.json());
    expect(known.json()).not.toHaveProperty("code");
    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.code).toMatch(/^\d{8}$/);
    const payload = { email, code: delivered[0]!.code, password: "a new strong password" };
    const reset = await app.inject({ method: "POST", url: "/v1/account/password-reset/confirm", payload });
    expect(reset.statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/v1/account/password-reset/confirm", payload })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/account/login", payload: { email, password } })).statusCode).toBe(401);
    const login = await app.inject({ method: "POST", url: "/v1/account/login", payload: { email, password: payload.password } });
    expect(login.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${login.json().token}` } })).statusCode).toBe(200);
  });

  it("expires reset codes and locks them after five wrong attempts", async () => {
    const now = new Date("2026-10-02T00:00:00Z");
    await accounts.createReset(email, "a".repeat(64), new Date(now.getTime() - 1));
    expect(await accounts.resetPassword(email, "a".repeat(64), "new hash", now)).toBe(false);
    await accounts.createReset(email, "a".repeat(64), new Date(now.getTime() + 10000));
    for (let attempt = 0; attempt < 5; attempt++) expect(await accounts.resetPassword(email, "b".repeat(64), "new hash", now)).toBe(false);
    expect(await accounts.resetPassword(email, "a".repeat(64), "new hash", now)).toBe(false);
  });

  it("deletes the account and linked records, rejects the old login and token", async () => {
    await app.inject({ method: "GET", url: "/v1/me", headers });
    if (database) {
      await database.query(`INSERT INTO entitlements (device_id, subscribed) VALUES ($1, true)`, [DEVICE]);
      await database.query(`INSERT INTO usage (bucket, device_id, day, used) VALUES ('reply', $1, CURRENT_DATE, 3)`, [DEVICE]);
      const codes = await database.query<{ code: string }>(`SELECT code FROM referral_codes WHERE device_id = $1`, [DEVICE]);
      await database.query(`INSERT INTO referral_redemptions (device_id, code) VALUES ('friend', $1)`, [codes.rows[0]!.code]);
    }
    const wrong = await app.inject({ method: "DELETE", url: "/v1/account", headers, payload: { password: "wrong" } });
    expect(wrong.statusCode).toBe(403);
    expect(await accounts.isClaimed(DEVICE)).toBe(true);
    const deleted = await app.inject({ method: "DELETE", url: "/v1/account", headers, payload: { password } });
    expect(deleted.statusCode).toBe(200);
    expect(await accounts.byEmail(email)).toBeNull();
    expect((await app.inject({ method: "GET", url: "/v1/me", headers })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/account/login", payload: { email, password } })).statusCode).toBe(401);
    if (database) for (const table of ["usage", "entitlements", "referral_codes", "referral_redemptions"]) {
      const result = await database.query(`SELECT * FROM ${table}`);
      expect(result.rows).toHaveLength(0);
    }
  });
});

it("sends a reset code using the configured sender without exposing provider errors", async () => {
  const send = vi.fn(async () => new Response('{"id":"test"}', { status: 200 }));
  await resendResetMailer("secret", "Rizz AI <login@example.com>", send as typeof fetch)(email, "12345678");
  const init = (send.mock.calls[0] as unknown[])[1] as RequestInit;
  expect(JSON.parse(init.body as string)).toMatchObject({ to: [email], from: "Rizz AI <login@example.com>" });
  const fail = (async () => new Response("private provider detail", { status: 500 })) as typeof fetch;
  await expect(resendResetMailer("secret", "sender", fail)(email, "12345678")).rejects.toThrow("could not be delivered");
});
