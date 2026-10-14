import { getAlbum, getAlbumList2, getStarred2 } from "@/api/subsonic";
import { sendTopSongs, type Mix } from "@/api/mixes";
import type { Child } from "@/types/subsonic";

// Your side of a mix: your top songs, from your own play counts, which only
// you can see in Navidrome.

/** How many of your songs a mix gets. */
const TOP_SONGS = 50;
/** Your most played albums to look through for your most played songs. */
const ALBUMS_TO_SCAN = 25;
const CONCURRENCY = 5;
/** How old your songs in a mix may get before they're refreshed. */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

let cached: { at: number; songs: Promise<Child[]> } | null = null;

async function loadTopSongs(): Promise<Child[]> {
  const albums = await getAlbumList2("frequent", ALBUMS_TO_SCAN);
  const songs: Child[] = [];
  for (let i = 0; i < albums.length; i += CONCURRENCY) {
    const batch = await Promise.all(albums.slice(i, i + CONCURRENCY).map((a) => getAlbum(a.id).catch(() => null)));
    for (const album of batch) songs.push(...(album?.song ?? []).filter((s) => (s.playCount ?? 0) > 0));
  }
  songs.sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0));
  const top = songs.slice(0, TOP_SONGS);

  // Not much played yet: make up the rest with liked songs.
  if (top.length < TOP_SONGS) {
    const ids = new Set(top.map((s) => s.id));
    const liked = (await getStarred2().catch(() => ({ song: [] }))).song ?? [];
    top.push(...liked.filter((s) => !ids.has(s.id)).slice(0, TOP_SONGS - top.length));
  }
  return top;
}

/** Your most played songs (then liked ones), most played first. */
export function getMyTopSongs(): Promise<Child[]> {
  // Worked out once an hour at most: it takes a few dozen requests.
  if (!cached || Date.now() - cached.at > 60 * 60 * 1000) {
    const songs = loadTopSongs();
    cached = { at: Date.now(), songs };
    songs.catch(() => (cached = null));
  }
  return cached.songs;
}

/** Re-sends your top songs to the mix if they're over a day old; resolves to the updated mix, or null. */
export async function refreshMyPart(mix: Mix, username: string): Promise<Mix | null> {
  const me = mix.members.find((m) => m.username === username);
  if (!me || Date.now() - me.updatedAt < REFRESH_AFTER_MS) return null;
  return sendTopSongs(mix.id, await getMyTopSongs());
}
