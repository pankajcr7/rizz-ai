/**
 * Anonymous device sessions. No sign-up: the app generates a random device id,
 * exchanges it for a signed token, and sends that token on every request.
 * Tokens are HMAC-signed so the server stays stateless.
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
  const payload = Buffer.from(JSON.stringify({ d: deviceId, iat: Date.now() })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the device id, or null for a missing, malformed or forged token. */
export function verifyToken(token: string | undefined, secret: string): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { d } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return isValidDeviceId(d) ? d : null;
  } catch {
    return null;
  }
}
