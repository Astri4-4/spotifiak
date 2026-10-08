import md5 from "blueimp-md5";

const API_VERSION = "1.16.1";
const CLIENT_NAME = "spotifion";
const STORAGE_KEY = "spotifion.auth";

export interface Credentials {
  server: string; // kept for display only; requests always go through /rest (same-origin, proxied by nginx)
  username: string;
  salt: string;
  token: string;
}

export class SubsonicError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = "SubsonicError";
  }
}

export class AuthError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}

function randomSalt(length = 12): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

export function loadCredentials(): Credentials | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.username && parsed?.salt && parsed?.token) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
}

export function clearCredentials() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Derives Subsonic token-auth credentials from a username/password without
 * ever persisting the password itself: the salt+token pair it produces can
 * be reused indefinitely (the server re-derives md5(storedPassword + salt)
 * on every request), so we only need the plaintext password this once.
 */
export function deriveCredentials(
  username: string,
  password: string,
): Credentials {
  const salt = randomSalt();
  const token = md5(password + salt);
  return { server: "", username, salt, token };
}

function authParams(creds: Credentials) {
  return {
    u: creds.username,
    t: creds.token,
    s: creds.salt,
    v: API_VERSION,
    c: CLIENT_NAME,
    f: "json",
  };
}

function toSearchParams(params: Record<string, unknown>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, String(v));
    } else {
      search.append(key, String(value));
    }
  }
  return search;
}

/** Builds a fully-qualified, same-origin Subsonic request URL (e.g. for <img>/<audio> src). */
export function buildUrl(
  endpoint: string,
  params: Record<string, unknown> = {},
  creds?: Credentials | null,
): string {
  const c = creds ?? loadCredentials();
  if (!c) throw new AuthError();
  const search = toSearchParams({ ...authParams(c), ...params });
  return `/rest/${endpoint}?${search.toString()}`;
}

interface SubsonicResponseEnvelope {
  "subsonic-response": {
    status: "ok" | "failed";
    version: string;
    error?: { code: number; message: string };
    [key: string]: unknown;
  };
}

/** Low-level call: GETs a Subsonic endpoint and unwraps the envelope, throwing on failure. */
export async function request<T = Record<string, unknown>>(
  endpoint: string,
  params: Record<string, unknown> = {},
  creds?: Credentials | null,
): Promise<T> {
  const c = creds ?? loadCredentials();
  if (!c) throw new AuthError();

  const search = toSearchParams({ ...authParams(c), ...params });
  const res = await fetch(`/rest/${endpoint}?${search.toString()}`);

  if (!res.ok) {
    throw new Error(`Subsonic request to ${endpoint} failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as SubsonicResponseEnvelope;
  const root = data["subsonic-response"];

  if (root.status !== "ok") {
    throw new SubsonicError(
      root.error?.code ?? 0,
      root.error?.message ?? `Unknown error calling ${endpoint}`,
    );
  }

  return data as unknown as T;
}
