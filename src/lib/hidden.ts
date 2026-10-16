import { useEffect, useMemo, useSyncExternalStore } from "react";
import { getAlbum, search3 } from "@/api/subsonic";
import { getHidden, hide, showAgain, type Hidden } from "@/api/hidden";
import type { AlbumID3, Child } from "@/types/subsonic";

// Hidden duplicates: extra copies of a song (from a single, a compilation, a
// downloaded playlist's folder...) that you've chosen not to see. Each is
// hidden wherever the copy kept is listed too, so lists show the song once,
// but a list with only that copy (someone's playlist) still has it. Albums
// made only of hidden copies are hidden from artist pages and search.
// Nothing changes in the library: it's per person, kept by the Jam server.

const SEARCH_CONCURRENCY = 6;
const MAX_DURATION_DIFF = 2; // seconds
/** Albums looked at to see whether all their songs are hidden. */
const MAX_ALBUMS_CHECKED = 100;
/** Loading your hidden songs failed: tries again after this, then twice as long each time, up to the max. */
const RETRY_FIRST_MS = 3_000;
const RETRY_MAX_MS = 60_000;

let state: Hidden = { songs: {}, albums: [] };
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function set(next: Hidden) {
  state = next;
  for (const l of listeners) l();
}

/**
 * Loads your hidden duplicates once signed in, and again when you come back
 * to the app (another device may have hidden more). Mount once.
 */
export function useHiddenLoader(username: string | null) {
  useEffect(() => {
    if (username !== loadedFor) {
      loadedFor = username;
      set({ songs: {}, albums: [] });
    }
    if (!username) return;
    let cancelled = false;
    let timer: number | undefined;
    let delay = RETRY_FIRST_MS;

    async function load() {
      window.clearTimeout(timer);
      try {
        const h = await getHidden();
        if (!cancelled && loadedFor === username) set(h);
        delay = RETRY_FIRST_MS;
      } catch {
        // The Jam server is restarting, or unreachable: try again, waiting longer each time.
        if (cancelled) return;
        timer = window.setTimeout(load, delay);
        delay = Math.min(delay * 2, RETRY_MAX_MS);
      }
    }

    void load();
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [username]);
}

export function useHidden(): Hidden {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/**
 * The positions of the songs to show: a hidden copy goes when the copy kept
 * is in the list too, or another copy of it is already shown.
 */
export function visibleIndices(songs: Child[], hidden: Hidden): number[] {
  const ids = new Set(songs.map((s) => s.id));
  /** Kept copy's id → the hidden copy shown in its place. */
  const standIn = new Map<string, string>();
  const out: number[] = [];
  songs.forEach((song, i) => {
    const kept = hidden.songs[song.id];
    if (!kept) return out.push(i);
    if (ids.has(kept)) return;
    const shown = standIn.get(kept);
    if (shown === undefined) standIn.set(kept, song.id);
    // The same song twice in a playlist stays twice.
    if (shown === undefined || shown === song.id) out.push(i);
  });
  return out;
}

/** `songs` without the hidden duplicates. */
export function useVisibleSongs(songs: Child[]): Child[] {
  const hidden = useHidden();
  return useMemo(() => visibleIndices(songs, hidden).map((i) => songs[i]), [songs, hidden]);
}

/** `albums` without those made only of hidden copies. */
export function useVisibleAlbums<T extends AlbumID3>(albums: T[]): T[] {
  const hidden = useHidden();
  return useMemo(() => {
    const gone = new Set(hidden.albums);
    return gone.size ? albums.filter((a) => !gone.has(a.id)) : albums;
  }, [albums, hidden]);
}

// ---- finding them -----------------------------------------------------------

export interface DuplicateGroup {
  keep: Child;
  hide: Child[];
}

const normalise = (s: string | undefined) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function sameSong(a: Child, b: Child): boolean {
  return (
    normalise(a.title) === normalise(b.title) &&
    normalise(a.artist) === normalise(b.artist) &&
    Math.abs((a.duration ?? 0) - (b.duration ?? 0)) <= MAX_DURATION_DIFF
  );
}

/** A single's album is named after its song ("Song", "Song - Single", "Song (EP)"). */
function isSingle(song: Child): boolean {
  const album = normalise(song.album).replace(/\s*[-([]\s*(single|ep)\s*[)\]]?$/, "");
  return album === normalise(song.title);
}

/** Which copy to keep: an album's track over a single, one kept before, then the best quality. */
function better(keptBefore: Set<string>) {
  return (a: Child, b: Child) =>
    Number(isSingle(a)) - Number(isSingle(b)) ||
    Number(keptBefore.has(b.id)) - Number(keptBefore.has(a.id)) ||
    (b.bitRate ?? 0) - (a.bitRate ?? 0) ||
    a.id.localeCompare(b.id);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

/** Every copy of `song` in the library, itself included. */
async function copiesOf(song: Child): Promise<Child[]> {
  try {
    const found = await search3(song.title, { songCount: 50, artistCount: 0, albumCount: 0 });
    const copies = (found.song ?? []).filter((s) => sameSong(s, song));
    return copies.some((c) => c.id === song.id) ? copies : [song, ...copies];
  } catch {
    return [song];
  }
}

/**
 * The copies of these songs in the library, grouped by song: which to keep
 * and which to hide. Also the albums that would then only have hidden songs.
 */
export async function findDuplicates(
  songs: Child[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ groups: DuplicateGroup[]; albums: { id: string; name: string }[] }> {
  const unique = [...new Map(songs.map((s) => [s.id, s])).values()];
  let done = 0;
  const found = await mapLimit(unique, SEARCH_CONCURRENCY, async (s) => {
    const copies = await copiesOf(s);
    onProgress?.(++done, unique.length);
    return copies;
  });

  const keptBefore = new Set(Object.values(state.songs));
  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();
  for (const copies of found) {
    const distinct = [...new Map(copies.map((c) => [c.id, c])).values()];
    if (distinct.length < 2 || distinct.some((c) => seen.has(c.id))) continue;
    for (const c of distinct) seen.add(c.id);
    const [keep, ...hide] = distinct.sort(better(keptBefore));
    groups.push({ keep, hide });
  }

  // Albums whose every song would be hidden: a single, or a playlist's folder.
  const hiding = new Set([...Object.keys(state.songs), ...groups.flatMap((g) => g.hide.map((s) => s.id))]);
  const candidates = [...new Set(groups.flatMap((g) => g.hide.map((s) => s.albumId)).filter(Boolean) as string[])]
    .filter((id) => !state.albums.includes(id))
    .slice(0, MAX_ALBUMS_CHECKED);
  const albums = (
    await mapLimit(candidates, SEARCH_CONCURRENCY, async (id) => {
      try {
        const album = await getAlbum(id);
        const tracks = album.song ?? [];
        return tracks.length && tracks.every((t) => hiding.has(t.id)) ? { id, name: album.name } : null;
      } catch {
        return null;
      }
    })
  ).filter((a): a is { id: string; name: string } => a !== null);

  return { groups, albums };
}

export async function hideDuplicates(groups: DuplicateGroup[], albums: string[]): Promise<void> {
  const songs: Record<string, string> = {};
  for (const g of groups) for (const s of g.hide) songs[s.id] = g.keep.id;
  set(await hide(songs, albums));
}

/** Of these songs and albums, the ones hidden. */
export function hiddenAmong(songs: Child[], albumIds: string[], hidden: Hidden) {
  return {
    songs: [...new Set(songs.filter((s) => hidden.songs[s.id]).map((s) => s.id))],
    albums: albumIds.filter((id) => hidden.albums.includes(id)),
  };
}

export async function showHiddenAgain(what: { songs?: string[]; albums?: string[] } | { all: true }): Promise<void> {
  set(await showAgain(what));
}
