import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Db } from "./postgres.js";

const scrypt = promisify(scryptCallback);

export interface Account {
  email: string;
  deviceId: string;
  passwordHash: string;
}

export interface AccountStore {
  register(account: Account): Promise<boolean>;
  byEmail(email: string): Promise<Account | null>;
  isClaimed(deviceId: string): Promise<boolean>;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("base64url")}`;
}

export async function checkPassword(password: string, stored: string | null): Promise<boolean> {
  const [, salt, key] = stored?.split(":") ?? [];
  // Do equal work for unknown emails; the response never says whether the email exists.
  const candidate = (await scrypt(password, salt || "no-such-account-salt", 64)) as Buffer;
  if (!salt || !key) return false;
  const actual = Buffer.from(key, "base64url");
  return actual.length === candidate.length && timingSafeEqual(actual, candidate);
}

export class MemoryAccounts implements AccountStore {
  private byMail = new Map<string, Account>();
  private byDevice = new Map<string, Account>();

  async register(account: Account) {
    if (this.byMail.has(account.email) || this.byDevice.has(account.deviceId)) return false;
    this.byMail.set(account.email, account);
    this.byDevice.set(account.deviceId, account);
    return true;
  }
  async byEmail(email: string) { return this.byMail.get(email) ?? null; }
  async isClaimed(deviceId: string) { return this.byDevice.has(deviceId); }
}

export class PgAccounts implements AccountStore {
  constructor(private db: Db) {}

  async register(account: Account) {
    const { rows } = await this.db.query(
      `INSERT INTO accounts (email, device_id, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING device_id`,
      [account.email, account.deviceId, account.passwordHash],
    );
    return rows.length > 0;
  }

  async byEmail(email: string) {
    const { rows } = await this.db.query<{ email: string; device_id: string; password_hash: string }>(
      `SELECT email, device_id, password_hash FROM accounts WHERE email = $1`, [email],
    );
    const row = rows[0];
    return row ? { email: row.email, deviceId: row.device_id, passwordHash: row.password_hash } : null;
  }

  async isClaimed(deviceId: string) {
    const { rows } = await this.db.query(`SELECT 1 FROM accounts WHERE device_id = $1`, [deviceId]);
    return rows.length > 0;
  }
}
