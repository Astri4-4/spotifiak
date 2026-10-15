import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";

// Client for Discover (server/discover.mjs): searching Deezer and downloading
// into the library, through the Jam server, which talks to deemix for us.

export interface DiscoverTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  /** Deezer's 30-second preview. */
  preview: string;
}

export interface DiscoverAlbum {
  id: string;
  title: string;
  artist: string;
  cover: string;
  trackCount: number;
}

export type DiscoverType = "track" | "album";

/** A track of a Deezer album's tracklist. */
export interface DiscoverAlbumTrack {
  id: string;
  title: string;
  disc: number;
  track: number;
  duration: number;
  /** False for tracks Deezer can't stream (rights), which can't be downloaded either. */
  available: boolean;
}

export interface DiscoverDownload {
  uuid: string;
  type: string;
  title: string;
  artist: string;
  cover: string;
  /** deemix's: "inQueue", "downloading", "completed", "withErrors", "failed"; "gone" once out of its queue. */
  status: string;
  progress: number;
  size: number;
  downloaded: number;
  failed: number;
}

export interface DiscoverConfig {
  available: boolean;
  /** Navidrome admins can set which deemix to use, and see it. */
  canEdit: boolean;
  url?: string;
  /** After saving: false if it only lasts until the server restarts. */
  persisted?: boolean;
}

export class DiscoverError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "DiscoverError";
  }
}

export function isDownloadDone(d: DiscoverDownload): boolean {
  return ["completed", "withErrors", "failed", "gone"].includes(d.status);
}

async function call<T>(path: string, query: Record<string, string> = {}, body?: unknown): Promise<T> {
  const base = jamBase();
  if (base === null) throw new DiscoverError(503, "Discover needs a Jam server. Set one in Settings.");
  let res: Response;
  try {
    res = await fetch(`${base}/jam-api/discover/${path}?${authSearchParams(query)}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new DiscoverError(0, "Couldn't reach the server.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // No explanation: a proxy in between (e.g. Cloudflare) answered instead.
    const fallback =
      res.status >= 500 ? "Discover isn't available right now: the server or the download server can't be reached." : `Discover request failed (${res.status}).`;
    throw new DiscoverError(res.status, data?.error ?? fallback);
  }
  return data as T;
}

export function getDiscoverConfig(): Promise<DiscoverConfig> {
  return call("config");
}

export function setDiscoverUrl(url: string): Promise<DiscoverConfig> {
  return call("config", {}, { url });
}

export async function discoverSearch(q: string, type: "track"): Promise<DiscoverTrack[]>;
export async function discoverSearch(q: string, type: "album"): Promise<DiscoverAlbum[]>;
export async function discoverSearch(q: string, type: DiscoverType): Promise<DiscoverTrack[] | DiscoverAlbum[]> {
  return (await call<{ results: DiscoverTrack[] | DiscoverAlbum[] }>("search", { q, type })).results;
}

export async function getDiscoverAlbumTracks(id: string): Promise<DiscoverAlbumTrack[]> {
  return (await call<{ tracks: DiscoverAlbumTrack[] }>("album", { id })).tracks;
}

export async function startDownload(type: DiscoverType, id: string): Promise<DiscoverDownload[]> {
  return (await call<{ downloads: DiscoverDownload[] }>("downloads", {}, { type, id })).downloads;
}

export async function getDownloads(): Promise<DiscoverDownload[]> {
  return (await call<{ downloads: DiscoverDownload[] }>("downloads")).downloads;
}
