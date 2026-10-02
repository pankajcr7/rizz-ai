/**
 * Typed client for guest and email accounts. Sessions live in SecureStore.
 */
import { Platform } from "react-native";
import * as Crypto from "expo-crypto";
import type {
  ApiError,
  ApiErrorCode,
  ChatRequest,
  ChatResponse,
  DatePlanRequest,
  DatePlanResponse,
  ExtractRequest,
  ExtractResponse,
  OpenersRequest,
  OpenersResponse,
  ProfileReviewRequest,
  ProfileReviewResponse,
  QuotaInfo,
  ReferralInfo,
  SuggestRequest,
  SuggestResponse,
  TranscribeRequest,
} from "@rizz/shared";
import { secureStorage } from "../lib/secureStorage";

export const API_URL =
  // `||` so a blank value in .env falls back to the local default too.
  process.env.EXPO_PUBLIC_API_URL?.trim() ||
  // Browser / iOS simulator reach the Mac as localhost; the Android emulator uses 10.0.2.2.
  (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787");

const DEVICE_KEY = "rizz.deviceId";
const TOKEN_KEY = "rizz.token";
const ACCOUNT_KEY = "rizz.accountEmail";
export type AccountSession = { token: string; deviceId: string; email: string };

export class RizzApiError extends Error {
  constructor(
    public code: ApiErrorCode | "network",
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

let tokenPromise: Promise<string> | null = null;

export async function getDeviceId(): Promise<string> {
  let id = await secureStorage.get(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID().replace(/-/g, "");
    await secureStorage.set(DEVICE_KEY, id);
  }
  return id;
}

async function fetchToken(): Promise<string> {
  const deviceId = await getDeviceId();
  const res = await timedFetch(`${API_URL}/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
  if (!res.ok) throw new RizzApiError("unauthorized", "Could not start a session", res.status);
  const { token } = (await res.json()) as { token: string };
  await secureStorage.set(TOKEN_KEY, token);
  return token;
}

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const saved = await secureStorage.get(TOKEN_KEY);
    if (saved) return saved;
  }
  if (await secureStorage.get(ACCOUNT_KEY)) throw new RizzApiError("unauthorized", "Please log in again to continue.", 401);
  // De-duplicate concurrent refreshes.
  tokenPromise ??= fetchToken().finally(() => (tokenPromise = null));
  return tokenPromise;
}

/** Session token for native code that calls the API itself (the Rizz Keyboard). Creates one if needed. */
export const getSessionToken = () => getToken();

/** AI calls can take a while, but never spin forever. */
const TIMEOUT_MS = 60_000;

async function timedFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    if (controller.signal.aborted) {
      throw new RizzApiError("network", `The server took too long to answer (${API_URL}). Check the backend terminal for errors and try again.`);
    }
    throw new RizzApiError("network", `Can't reach the Rizz AI server at ${API_URL}. Is the backend running, and is this device on the same Wi-Fi?`);
  } finally {
    clearTimeout(timer);
  }
}

async function request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, retried = false): Promise<T> {
  const token = await getToken();
  const res = await timedFetch(`${API_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 401 && !retried) {
    if (await secureStorage.get(ACCOUNT_KEY)) {
      await secureStorage.remove(TOKEN_KEY);
      throw new RizzApiError("unauthorized", "Please log in again to continue.", 401);
    }
    await getToken(true);
    return request<T>(method, path, body, true);
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new RizzApiError(err?.error.code ?? "internal", err?.error.message ?? "Something went wrong", res.status);
  }
  return (await res.json()) as T;
}

async function accountRequest(path: string, body: { email: string; password: string }, guestToken?: string): Promise<AccountSession> {
  const res = await timedFetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(guestToken ? { authorization: `Bearer ${guestToken}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new RizzApiError(err?.error.code ?? "internal", err?.error.message ?? "Couldn't access your account", res.status);
  }
  const account = (await res.json()) as AccountSession;
  await secureStorage.set(DEVICE_KEY, account.deviceId);
  await secureStorage.set(TOKEN_KEY, account.token);
  await secureStorage.set(ACCOUNT_KEY, account.email);
  tokenPromise = null;
  return account;
}

export const account = {
  email: () => secureStorage.get(ACCOUNT_KEY),
  signUp: async (email: string, password: string) => accountRequest("/v1/account/signup", { email, password }, await getToken()),
  logIn: (email: string, password: string) => accountRequest("/v1/account/login", { email, password }),
  requestReset: (email: string) => publicAccountRequest<{ ok: true; message: string }>("/v1/account/password-reset/request", { email }),
  confirmReset: (email: string, code: string, password: string) => publicAccountRequest<{ ok: true }>("/v1/account/password-reset/confirm", { email, code, password }),
  delete: (password: string) => request<{ ok: true }>("DELETE", "/v1/account", { password }),
  signOut: async () => {
    await Promise.all([secureStorage.remove(ACCOUNT_KEY), secureStorage.remove(TOKEN_KEY), secureStorage.remove(DEVICE_KEY)]);
    tokenPromise = null;
  },
};

async function publicAccountRequest<T>(path: string, body: unknown): Promise<T> {
  const res = await timedFetch(`${API_URL}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new RizzApiError(err?.error.code ?? "internal", err?.error.message ?? "Couldn't access your account", res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  suggest: (body: SuggestRequest) => request<SuggestResponse>("POST", "/v1/suggest", body),
  openers: (body: OpenersRequest) => request<OpenersResponse>("POST", "/v1/openers", body),
  extract: (body: ExtractRequest) => request<ExtractResponse>("POST", "/v1/extract", body),
  chat: (body: ChatRequest) => request<ChatResponse>("POST", "/v1/chat", body),
  profileReview: (body: ProfileReviewRequest) => request<ProfileReviewResponse>("POST", "/v1/profile-review", body),
  redeem: (code: string) => request<{ ok: true; rewardDays: number; referral: ReferralInfo }>("POST", "/v1/referral/redeem", { code }),
  datePlan: (body: DatePlanRequest) => request<DatePlanResponse>("POST", "/v1/date-plan", body),
  transcribe: (body: TranscribeRequest) => request<{ text: string }>("POST", "/v1/transcribe", body),
  me: () => request<{ quota: QuotaInfo; referral: ReferralInfo; features?: { voice: boolean } }>("GET", "/v1/me"),
};

/** Human-friendly message for any error thrown by the client. */
export function errorMessage(e: unknown): string {
  if (e instanceof RizzApiError) return e.message;
  return "Something went wrong. Try again.";
}
