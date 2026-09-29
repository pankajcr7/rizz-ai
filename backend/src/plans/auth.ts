/**
 * Signed guest and account sessions. The account token keeps the original
 * device identity so quotas and purchases survive guest-to-account upgrade.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;

export function isValidDeviceId(id: unknown): id is string {
  return typeof id === "string" && DEVICE_ID.test(id);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueToken(deviceId: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ d: deviceId, k: "guest", iat: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function issueAccountToken(deviceId: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ d: deviceId, k: "account", iat: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token: string | undefined, secret: string): { deviceId: string; kind: "guest" | "account" } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { d, k, iat } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!isValidDeviceId(d)) return null;
    const kind = k === "account" ? "account" : k === "guest" || k == null ? "guest" : null;
    if (!kind) return null;
    if (kind === "account" && (typeof iat !== "number" || iat > Date.now() + 60_000 || Date.now() - iat > 90 * 86_400_000)) return null;
    return { deviceId: d, kind };
  } catch {
    return null;
  }
}

/** Returns the device id, or null for a missing, malformed or forged token. */
export function verifyToken(token: string | undefined, secret: string): string | null {
  return verifySession(token, secret)?.deviceId ?? null;
}
