import { getAlbum, getAlbumList2, getStarred2 } from "@/api/subsonic";
import type { AlbumID3, Child } from "@/types/subsonic";

// Smart playlists: worked out from your own listening (play counts and when
// you last played or liked something, which Navidrome keeps per person), so
// they change as you listen. Nothing is stored; one can be saved as a
// regular playlist.

export type SmartPlaylistId = "most-played" | "recently-played" | "recently-added" | "liked-unplayed" | "forgotten-likes";

export interface SmartPlaylist {
  id: SmartPlaylistId;
  name: string;
  description: string;
  /** Tailwind gradient of its cover. */
  gradient: string;
  load: () => Promise<Child[]>;
}

const CONCURRENCY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** A like not played for this long is forgotten. */
const FORGOTTEN_AFTER_MS = 90 * DAY_MS;

const time = (date: string | undefined) => (date ? Date.parse(date) || 0 : 0);

async function songsOf(albums: AlbumID3[]): Promise<Child[]> {
  const songs: Child[] = [];
  for (let i = 0; i < albums.length; i += CONCURRENCY) {
    const batch = await Promise.all(albums.slice(i, i + CONCURRENCY).map((a) => getAlbum(a.id).catch(() => null)));
    for (const album of batch) songs.push(...(album?.song ?? []));
  }
  return songs;
}

async function liked(): Promise<Child[]> {
  return (await getStarred2()).song ?? [];
}

export const SMART_PLAYLISTS: SmartPlaylist[] = [
  {
    id: "most-played",
    name: "On Repeat",
    description: "The songs you play the most",
    gradient: "from-rose-600 to-orange-400",
    async load() {
      // Your most played songs are on your most played albums.
      const songs = await songsOf(await getAlbumList2("frequent", 40));
      return songs
        .filter((s) => (s.playCount ?? 0) > 0)
        .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
        .slice(0, 100);
    },
  },
  {
    id: "recently-played",
    name: "Recently Played",
    description: "What you listened to lately, latest first",
    gradient: "from-sky-600 to-cyan-300",
    async load() {
      const songs = await songsOf(await getAlbumList2("recent", 30));
      return songs
        .filter((s) => s.played)
        .sort((a, b) => time(b.played) - time(a.played))
        .slice(0, 100);
    },
  },
  {
    id: "recently-added",
    name: "Fresh in the Library",
    description: "The newest albums' songs",
    gradient: "from-emerald-600 to-lime-300",
    async load() {
      return (await songsOf(await getAlbumList2("newest", 25))).slice(0, 200);
    },
  },
  {
    id: "liked-unplayed",
    name: "Liked, Never Played",
    description: "Songs you liked but haven't played yet",
    gradient: "from-violet-700 to-fuchsia-400",
    async load() {
      return (await liked()).filter((s) => !s.playCount).sort((a, b) => time(b.starred) - time(a.starred));
    },
  },
  {
    id: "forgotten-likes",
    name: "Forgotten Likes",
    description: "Songs you liked but haven't played in 3 months",
    gradient: "from-amber-600 to-yellow-300",
    async load() {
      const before = Date.now() - FORGOTTEN_AFTER_MS;
      return (await liked())
        .filter((s) => s.playCount && s.played && time(s.played) < before)
        .sort((a, b) => time(a.played) - time(b.played));
    },
  },
];

export function smartPlaylist(id: string | undefined): SmartPlaylist | undefined {
  return SMART_PLAYLISTS.find((p) => p.id === id);
}
