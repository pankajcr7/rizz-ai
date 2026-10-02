/**
 * Referral codes: every device gets a stable 6-character code. A new user who
 * enters it gets Pro days, and so does the referrer (capped, to limit farming).
 * In-memory store; swap for Redis/Postgres with the same interface.
 */
import { createHmac } from "node:crypto";

// No 0/O/1/I — easy to read aloud and type.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Deterministic code for a device (same device → same code, can't be guessed without the secret). */
export function referralCode(deviceId: string, secret: string): string {
  const bytes = createHmac("sha256", `${secret}:referral`).update(deviceId).digest();
  let code = "";
  for (let i = 0; i < 6; i++) code += ALPHABET[bytes[i]! % ALPHABET.length];
  return code;
}

/** Referrers are rewarded for at most this many friends. */
export const MAX_REWARDED_INVITES = 10;

export interface ReferralStore {
  forget?(deviceId: string): Promise<void>;
  register(code: string, deviceId: string): Promise<void>;
  owner(code: string): Promise<string | null>;
  /** Records that `deviceId` redeemed `code`. Returns false if it already redeemed one. */
  redeem(deviceId: string, code: string): Promise<boolean>;
  hasRedeemed(deviceId: string): Promise<boolean>;
  invites(referrerId: string): Promise<number>;
}

export class MemoryReferrals implements ReferralStore {
  private owners = new Map<string, string>();
  private redeemedBy = new Map<string, string>(); // deviceId → code
  private inviteCounts = new Map<string, number>(); // referrerId → n

  async forget(deviceId: string) {
    const used = this.redeemedBy.get(deviceId);
    const previousOwner = used ? this.owners.get(used) : undefined;
    if (previousOwner) this.inviteCounts.set(previousOwner, Math.max(0, (this.inviteCounts.get(previousOwner) ?? 0) - 1));
    this.redeemedBy.delete(deviceId);
    for (const [code, owner] of this.owners) if (owner === deviceId) {
      for (const [redeemer, redeemed] of this.redeemedBy) if (redeemed === code) this.redeemedBy.delete(redeemer);
      this.owners.delete(code);
    }
    this.inviteCounts.delete(deviceId);
  }

  async register(code: string, deviceId: string) {
    if (!this.owners.has(code)) this.owners.set(code, deviceId);
  }
  async owner(code: string) {
    return this.owners.get(code) ?? null;
  }
  async redeem(deviceId: string, code: string) {
    if (this.redeemedBy.has(deviceId)) return false;
    this.redeemedBy.set(deviceId, code);
    const owner = this.owners.get(code);
    if (owner) this.inviteCounts.set(owner, (this.inviteCounts.get(owner) ?? 0) + 1);
    return true;
  }
  async hasRedeemed(deviceId: string) {
    return this.redeemedBy.has(deviceId);
  }
  async invites(referrerId: string) {
    return this.inviteCounts.get(referrerId) ?? 0;
  }
}
