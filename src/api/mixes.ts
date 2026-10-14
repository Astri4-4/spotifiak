import { authSearchParams } from "./client";
import { toJamTrack, type JamTrack } from "./jam";
import { jamBase } from "@/lib/servers";
import type { Child } from "@/types/subsonic";

// Client for Mixes (server/mixes.mjs): playlists blended from the top songs
// of a few people, kept by the Jam server.

export interface MixMember {
  username: string;
  songCount: number;
  /** When they last sent their top songs (ms since epoch). */
  updatedAt: number;
}

export interface MixSummary {
  id: string;
  name: string;
  owner: string;
  members: MixMember[];
  updatedAt: number;
}

export interface MixEntry {
  track: JamTrack;
  /** Whose top songs it comes from. */
  from: string[];
}

/** What members see; others only get the summary. */
export interface Mix extends MixSummary {
  /** The owner's public Navidrome copy, if they made one. */
  playlistId: string | null;
  tracks: MixEntry[];
}

export class MixError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "MixError";
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const base = jamBase();
  if (base === null) throw new MixError(503, "Mixes need a Jam server. Set one in Settings.");
  let res: Response;
  try {
    res = await fetch(`${base}/jam-api/mixes${path}?${authSearchParams()}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new MixError(0, "Couldn't reach the server.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new MixError(
      res.status,
      data?.error ?? (res.status >= 500 ? "Mixes aren't available right now." : `Mix request failed (${res.status}).`),
    );
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export function isFullMix(mix: Mix | MixSummary): mix is Mix {
  return "tracks" in mix;
}

/** Your mixes (with the covers of their first songs), and whether the server keeps them across restarts. */
export function getMixes(): Promise<{ mixes: (MixSummary & { covers: (string | undefined)[] })[]; persisted: boolean }> {
  return call("");
}

/** Resolves to null if there's no such mix. */
export async function getMix(id: string): Promise<Mix | MixSummary | null> {
  try {
    return await call<Mix | MixSummary>(`/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof MixError && err.status === 404) return null;
    throw err;
  }
}

export function createMix(name: string, topSongs: Child[]): Promise<Mix> {
  return call("", { name, tracks: topSongs.map(toJamTrack) });
}

/** Joins the mix, or refreshes your songs in it. */
export function sendTopSongs(id: string, topSongs: Child[]): Promise<Mix> {
  return call(`/${encodeURIComponent(id)}/tracks`, { tracks: topSongs.map(toJamTrack) });
}

export function setMixPlaylist(id: string, playlistId: string | null): Promise<Mix> {
  return call(`/${encodeURIComponent(id)}/playlist`, { playlistId });
}

/** Leaves the mix; the owner's leaving deletes it. */
export function leaveMix(id: string): Promise<void> {
  return call(`/${encodeURIComponent(id)}/leave`, {});
}

/** Normalises user input like "abc 123" or a full invite link to a mix code. */
export function parseMixCode(input: string): string | null {
  const fromLink = input.match(/\/mix\/([A-Za-z0-9]{6})\b/);
  const code = (fromLink ? fromLink[1] : input.replace(/[\s-]/g, "")).toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}
