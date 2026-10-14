import { buildUrl, request, type Credentials } from "./client";
import type {
  AlbumID3,
  AlbumWithSongsID3,
  ArtistID3,
  ArtistWithAlbumsID3,
  Child,
  IndexID3,
  NowPlayingEntry,
  Playlist,
  PlaylistWithSongs,
  SearchResult3,
} from "@/types/subsonic";

/** Verifies the given (or stored) credentials actually work. Throws SubsonicError/AuthError if not. */
export async function ping(creds?: Credentials): Promise<void> {
  await request("ping", {}, creds);
}

export type AlbumListType =
  | "random"
  | "newest"
  | "frequent"
  | "recent"
  | "alphabeticalByName"
  | "alphabeticalByArtist"
  | "starred";

export async function getAlbumList2(
  type: AlbumListType,
  size = 20,
  offset = 0,
): Promise<AlbumID3[]> {
  const res = await request<{
    "subsonic-response": { albumList2: { album?: AlbumID3[] } };
  }>("getAlbumList2", { type, size, offset });
  return res["subsonic-response"].albumList2.album ?? [];
}

export async function getArtists(): Promise<ArtistID3[]> {
  const res = await request<{
    "subsonic-response": { artists: { index?: IndexID3[] } };
  }>("getArtists");
  const index = res["subsonic-response"].artists.index ?? [];
  return index.flatMap((group) => group.artist);
}

export async function getArtist(id: string): Promise<ArtistWithAlbumsID3> {
  const res = await request<{
    "subsonic-response": { artist: ArtistWithAlbumsID3 };
  }>("getArtist", { id });
  return res["subsonic-response"].artist;
}

export async function getAlbum(id: string): Promise<AlbumWithSongsID3> {
  const res = await request<{
    "subsonic-response": { album: AlbumWithSongsID3 };
  }>("getAlbum", { id });
  return res["subsonic-response"].album;
}

export async function search3(
  query: string,
  options: { artistCount?: number; albumCount?: number; songCount?: number } = {},
): Promise<SearchResult3> {
  const res = await request<{
    "subsonic-response": { searchResult3: SearchResult3 };
  }>("search3", {
    query,
    artistCount: options.artistCount ?? 10,
    albumCount: options.albumCount ?? 10,
    songCount: options.songCount ?? 20,
  });
  return res["subsonic-response"].searchResult3;
}

export async function getPlaylists(): Promise<Playlist[]> {
  const res = await request<{
    "subsonic-response": { playlists: { playlist?: Playlist[] } };
  }>("getPlaylists");
  return res["subsonic-response"].playlists.playlist ?? [];
}

export async function getPlaylist(id: string): Promise<PlaylistWithSongs> {
  const res = await request<{
    "subsonic-response": { playlist: PlaylistWithSongs };
  }>("getPlaylist", { id });
  return res["subsonic-response"].playlist;
}

export async function createPlaylist(name: string): Promise<Playlist> {
  const res = await request<{
    "subsonic-response": { playlist: Playlist };
  }>("createPlaylist", { name });
  return res["subsonic-response"].playlist;
}

export async function deletePlaylist(id: string): Promise<void> {
  await request("deletePlaylist", { id });
}

export async function updatePlaylist(
  playlistId: string,
  options: { songIdToAdd?: string[]; songIndexToRemove?: number[]; name?: string; comment?: string; public?: boolean } = {},
): Promise<void> {
  await request("updatePlaylist", {
    playlistId,
    name: options.name,
    comment: options.comment,
    public: options.public,
    songIdToAdd: options.songIdToAdd,
    songIndexToRemove: options.songIndexToRemove,
  });
}

/** Replaces a playlist's songs, e.g. to reorder them (Subsonic has no "move"). */
export async function setPlaylistSongs(playlistId: string, songIds: string[]): Promise<void> {
  await request("createPlaylist", { playlistId, songId: songIds }, null, { post: true });
}

export async function star(options: {
  id?: string[];
  albumId?: string[];
  artistId?: string[];
}): Promise<void> {
  await request("star", options);
}

export async function unstar(options: {
  id?: string[];
  albumId?: string[];
  artistId?: string[];
}): Promise<void> {
  await request("unstar", options);
}

export async function getStarred2(): Promise<SearchResult3> {
  const res = await request<{
    "subsonic-response": { starred2: SearchResult3 };
  }>("getStarred2");
  return res["subsonic-response"].starred2;
}

/** What every user of the server is playing right now (from their "now playing" scrobbles). */
export async function getNowPlaying(): Promise<NowPlayingEntry[]> {
  const res = await request<{
    "subsonic-response": { nowPlaying: { entry?: NowPlayingEntry[] } };
  }>("getNowPlaying");
  return res["subsonic-response"].nowPlaying?.entry ?? [];
}

/** Asks Navidrome to look for new music now (admins only; others get an error). */
export async function startScan(): Promise<void> {
  await request("startScan");
}

export async function scrobble(id: string, submission = true): Promise<void> {
  await request("scrobble", { id, submission });
}

/** Builds an <img> src for cover art. Pass undefined/null coverArt to get a stable placeholder. */
export function coverArtUrl(coverArt: string | undefined | null, size = 300): string {
  if (!coverArt) return "/placeholder-cover.svg";
  return buildUrl("getCoverArt", { id: coverArt, size });
}

/** Builds an <audio> src that streams (and lets Navidrome transcode, if needed) a track. */
export function streamUrl(id: string): string {
  return buildUrl("stream", { id });
}

export function downloadUrl(id: string): string {
  return buildUrl("download", { id });
}

export type { AlbumID3, AlbumWithSongsID3, ArtistID3, ArtistWithAlbumsID3, Child, Playlist, PlaylistWithSongs, SearchResult3 };
