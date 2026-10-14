import { useEffect, useState, useSyncExternalStore } from "react";
import { getLyrics, getLyricsBySongId } from "@/api/subsonic";
import type { Child, StructuredLyrics } from "@/types/subsonic";

// Lyrics for the full-screen player. Navidrome's come first (from the file's
// tags or a .lrc next to it); when it has none, or only unsynced ones, we ask
// LRCLIB (https://lrclib.net), a free public lyrics database, unless the user
// turned online lookups off.

export interface LyricLine {
  /** Seconds into the song; only set when synced. */
  start?: number;
  text: string;
}

export interface Lyrics {
  synced: boolean;
  lines: LyricLine[];
  source: "navidrome" | "lrclib";
}

const STORAGE_KEY = "spotifion.onlineLyrics";
const listeners = new Set<() => void>();

export function getOnlineLyrics(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setOnlineLyrics(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Not saved: the setting stays as it was.
  }
  cache.clear();
  for (const l of listeners) l();
}

export function useOnlineLyrics(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getOnlineLyrics);
}

function fromStructured(entry: StructuredLyrics): Lyrics {
  const offset = (entry.offset ?? 0) / 1000;
  return {
    synced: entry.synced,
    lines: entry.line.map((l) => ({
      start: entry.synced && l.start !== undefined ? Math.max(0, l.start / 1000 - offset) : undefined,
      text: l.value,
    })),
    source: "navidrome",
  };
}

function fromPlain(text: string, source: Lyrics["source"]): Lyrics {
  return { synced: false, lines: text.replace(/\r/g, "").split("\n").map((t) => ({ text: t })), source };
}

const TIMESTAMP = /\[(\d+):(\d+(?:[.:]\d+)?)\]/g;

/** Parses LRC ("[01:23.45]Some line"), returning null if it has no timestamps. */
export function parseLrc(text: string, source: Lyrics["source"]): Lyrics | null {
  const offsetTag = /^\[offset:\s*([+-]?\d+)\s*\]/im.exec(text);
  const offset = offsetTag ? Number(offsetTag[1]) / 1000 : 0;
  const lines: LyricLine[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const stamps = [...raw.matchAll(TIMESTAMP)];
    if (stamps.length === 0) continue;
    const lineText = raw.replace(TIMESTAMP, "").trim();
    // A line can carry several timestamps (a repeated chorus).
    for (const [, min, sec] of stamps) {
      const start = Number(min) * 60 + Number(sec.replace(":", "."));
      lines.push({ start: Math.max(0, start - offset), text: lineText });
    }
  }
  if (lines.length === 0) return null;
  lines.sort((a, b) => a.start! - b.start!);
  return { synced: true, lines, source };
}

async function fromNavidrome(track: Child): Promise<Lyrics | null> {
  try {
    const all = await getLyricsBySongId(track.id);
    const best = all.find((l) => l.synced && l.line.length > 0) ?? all.find((l) => l.line.length > 0);
    if (best) return fromStructured(best);
  } catch {
    // Not an OpenSubsonic server: try the older call below.
  }
  try {
    const legacy = await getLyrics(track.artist, track.title);
    const text = legacy?.value?.trim();
    // Older servers may hand back raw LRC as plain text.
    if (text) return parseLrc(text, "navidrome") ?? fromPlain(text, "navidrome");
  } catch {
    // No lyrics on the server.
  }
  return null;
}

interface LrclibRecord {
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

function fromLrclibRecord(record: LrclibRecord | undefined): Lyrics | null {
  if (!record || record.instrumental) return null;
  if (record.syncedLyrics) {
    const parsed = parseLrc(record.syncedLyrics, "lrclib");
    if (parsed) return parsed;
  }
  return record.plainLyrics?.trim() ? fromPlain(record.plainLyrics.trim(), "lrclib") : null;
}

/**
 * The song's main artist: LRCLIB rarely finds a song under all of them
 * ("Ashnikko/K3tamine", "A feat. B"). Not split on "&" or ",", which are
 * also in band names ("Simon & Garfunkel").
 */
export function primaryArtist(track: Child): string {
  const first = track.artists?.[0]?.name?.trim();
  if (first) return first;
  const [main] = (track.artist ?? "").split(/\s*[/;]\s*|\s+(?:feat\.?|ft\.|featuring)\s+|\s*[([](?:feat\.?|ft\.|featuring)\s/i);
  return main.trim() || (track.artist ?? "").trim();
}

async function fromLrclib(track: Child): Promise<Lyrics | null> {
  const main = primaryArtist(track);
  const found = main ? await fromLrclibAs(track, main) : null;
  // A name with a "/" of its own (AC/DC) when Navidrome doesn't list the artists apart.
  const full = track.artist?.trim();
  if (found || !full || full === main) return found;
  return fromLrclibAs(track, full);
}

async function fromLrclibAs(track: Child, artist: string): Promise<Lyrics | null> {
  const base = "https://lrclib.net/api";
  const params = new URLSearchParams({ artist_name: artist, track_name: track.title });
  // The exact match needs the album and duration (within a couple of seconds).
  if (track.album && track.duration) {
    const exact = new URLSearchParams(params);
    exact.set("album_name", track.album);
    exact.set("duration", String(Math.round(track.duration)));
    const res = await fetch(`${base}/get?${exact}`);
    if (res.ok) {
      const found = fromLrclibRecord((await res.json()) as LrclibRecord);
      if (found) return found;
    }
  }
  const res = await fetch(`${base}/search?${params}`);
  if (!res.ok) return null;
  const results = (await res.json()) as LrclibRecord[];
  // Prefer synced lyrics from a version of about the same length.
  const close = track.duration
    ? results.filter((r) => Math.abs((r.duration ?? 0) - track.duration!) <= 3)
    : results;
  return fromLrclibRecord(close.find((r) => r.syncedLyrics) ?? close.find((r) => r.plainLyrics) ?? results.find((r) => r.syncedLyrics));
}

async function loadLyrics(track: Child): Promise<Lyrics | null> {
  const local = await fromNavidrome(track);
  if (local?.synced || !getOnlineLyrics()) return local;
  try {
    const online = await fromLrclib(track);
    // Synced online lyrics beat the server's plain ones; otherwise keep the server's.
    if (online && (online.synced || !local)) return online;
  } catch {
    // Offline, or LRCLIB is down.
  }
  return local;
}

const cache = new Map<string, Promise<Lyrics | null>>();

export type LyricsState = { status: "loading" } | { status: "done"; lyrics: Lyrics | null };

/** The lyrics of `track`, fetched once per song (and only while `enabled`). */
export function useLyrics(track: Child | null, enabled: boolean): LyricsState {
  const [state, setState] = useState<{ id: string; lyrics: Lyrics | null } | null>(null);
  const online = useOnlineLyrics();

  useEffect(() => {
    if (!track || !enabled) return;
    let promise = cache.get(track.id);
    if (!promise) {
      promise = loadLyrics(track);
      cache.set(track.id, promise);
    }
    let cancelled = false;
    void promise.then((lyrics) => {
      if (!cancelled) setState({ id: track.id, lyrics });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, enabled, online]);

  if (!track || state?.id !== track.id) return { status: "loading" };
  return { status: "done", lyrics: state.lyrics };
}
