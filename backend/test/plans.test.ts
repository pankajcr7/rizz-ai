import { describe, expect, it } from "vitest";
import { issueToken, verifyToken } from "../src/plans/auth.js";
import { ABUSE_CAP, MemoryQuota } from "../src/plans/quota.js";

const SECRET = "x".repeat(32);
const DEVICE = "device_abcdefghijklmnop";

describe("tokens", () => {
  it("round-trips", () => {
    expect(verifyToken(issueToken(DEVICE, SECRET), SECRET)).toBe(DEVICE);
  });

  it("rejects forged, tampered and malformed tokens", () => {
    const token = issueToken(DEVICE, SECRET);
    expect(verifyToken(token, "y".repeat(32))).toBeNull();
    const [payload, sig] = token.split(".");
    const other = Buffer.from(JSON.stringify({ d: "attacker_device_12345", iat: 1 })).toString("base64url");
    expect(verifyToken(`${other}.${sig}`, SECRET)).toBeNull();
    expect(verifyToken(payload, SECRET)).toBeNull();
    expect(verifyToken("", SECRET)).toBeNull();
    expect(verifyToken(undefined, SECRET)).toBeNull();
  });
});

describe("MemoryQuota", () => {
  const day = new Date("2026-09-25T10:00:00Z");

  it("enforces the free daily limit and resets the next UTC day", async () => {
    const q = new MemoryQuota();
    for (let i = 0; i < 10; i++) expect((await q.consume(DEVICE, "free", day)).allowed).toBe(true);
    const denied = await q.consume(DEVICE, "free", day);
    expect(denied.allowed).toBe(false);
    expect(denied.info).toMatchObject({ used: 10, limit: 10, resetsAt: "2026-09-26T00:00:00.000Z" });
    expect((await q.consume(DEVICE, "free", new Date("2026-09-26T00:00:01Z"))).allowed).toBe(true);
  });

  it("refunds a unit", async () => {
    const q = new MemoryQuota();
    await q.consume(DEVICE, "free", day);
    await q.refund(DEVICE, day);
    expect((await q.peek(DEVICE, "free", day)).used).toBe(0);
    await q.refund(DEVICE, day); // never goes negative
    expect((await q.peek(DEVICE, "free", day)).used).toBe(0);
  });

  it("caps pro at the abuse ceiling", async () => {
    const q = new MemoryQuota();
    for (let i = 0; i < ABUSE_CAP; i++) await q.consume(DEVICE, "pro", day);
    expect((await q.consume(DEVICE, "pro", day)).allowed).toBe(false);
  });
});
