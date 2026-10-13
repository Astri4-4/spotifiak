import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";
import type { Child } from "@/types/subsonic";

// Client for the Jam server (server/jam.mjs), under /jam-api - same-origin
// (proxied by nginx, Vite or the desktop app), or on the configured Jam
// server in the mobile app.

const NO_JAM_SERVER = "Jam needs a Jam server. Set one in Settings.";

function sessionsUrl(): string {
  const base = jamBase();
  if (base === null) throw new JamError(503, NO_JAM_SERVER);
  return `${base}/jam-api/sessions`;
}

export type JamTrack = Pick<
  Child,
  "id" | "title" | "artist" | "artistId" | "album" | "albumId" | "coverArt" | "duration"
>;

export interface JamQueueItem {
  uid: string;
  addedBy: string;
  track: JamTrack;
}

export interface JamMember {
  username: string;
  clientId: string;
}

export interface JamState {
  id: string;
  host: string;
  guestsCanControl: boolean;
  queue: JamQueueItem[];
  /** May equal queue.length once the queue has played out. */
  currentIndex: number;
  playing: boolean;
  /** Playhead in seconds at server time `positionAt` (ms since epoch). */
  position: number;
  positionAt: number;
  version: number;
  members: JamMember[];
}

export interface JamSnapshot {
  state: JamState;
  /** Server clock (ms since epoch) when this was sent, for clock-offset estimation. */
  now: number;
}

export type JamAction =
  | { type: "add"; tracks: JamTrack[] }
  | { type: "playNow"; tracks: JamTrack[] }
  | { type: "jump"; uid: string }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "seek"; position: number }
  | { type: "next" }
  | { type: "previous" }
  | { type: "ended"; uid: string }
  | { type: "remove"; uid: string }
  | { type: "setGuestControl"; value: boolean }
  | { type: "end" };

export class JamError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "JamError";
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${sessionsUrl()}${path}?${authSearchParams()}`;
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new JamError(0, "Couldn't reach the Jam server.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      body?.error ?? (res.status >= 500 ? "The Jam server isn't available right now." : `Jam request failed (${res.status}).`);
    throw new JamError(res.status, message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export async function createJam(): Promise<string> {
  const { id } = await call<{ id: string }>("", { method: "POST" });
  return id;
}

/** Resolves to null if the Jam doesn't exist (any more). */
export async function getJam(id: string): Promise<JamSnapshot | null> {
  try {
    return await call<JamSnapshot>(`/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof JamError && err.status === 404) return null;
    throw err;
  }
}

/** Whether the configured Jam server answers its health check. */
export async function jamServerReachable(): Promise<boolean> {
  const base = jamBase();
  if (base === null) return false;
  try {
    return (await fetch(`${base}/jam-api/healthz`)).ok;
  } catch {
    return false;
  }
}

export function jamEventsUrl(id: string, clientId: string): string {
  return `${sessionsUrl()}/${encodeURIComponent(id)}/events?${authSearchParams({ clientId })}`;
}

export async function sendJamAction(id: string, action: JamAction): Promise<void> {
  await call<void>(`/${encodeURIComponent(id)}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(action),
  });
}

/** Strips a track down to the fields the Jam server keeps. */
export function toJamTrack(track: Child): JamTrack {
  const { id, title, artist, artistId, album, albumId, coverArt, duration } = track;
  return { id, title, artist, artistId, album, albumId, coverArt, duration };
}

/** Normalises user input like "abc 123" or a full invite link to a Jam code. */
export function parseJamCode(input: string): string | null {
  const fromLink = input.match(/\/jam\/([A-Za-z0-9]{6})\b/);
  const code = (fromLink ? fromLink[1] : input.replace(/[\s-]/g, "")).toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}
