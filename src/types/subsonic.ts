// Minimal typings for the slice of the Subsonic API (as implemented by
// Navidrome) that this app uses. See:
// https://www.subsonic.org/pages/api.jsp
// https://www.navidrome.org/docs/developers/subsonic-api/

export interface ArtistID3 {
  id: string;
  name: string;
  coverArt?: string;
  albumCount?: number;
  starred?: string;
}

export interface AlbumID3 {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  year?: number;
  genre?: string;
  created?: string;
  starred?: string;
  /** When the logged-in user last played it (OpenSubsonic; Navidrome sends it). */
  played?: string;
}

export interface Child {
  id: string;
  parent?: string;
  isDir?: boolean;
  title: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  /** Each of its artists, the main one first (OpenSubsonic; Navidrome sends it). */
  artists?: { id: string; name: string }[];
  track?: number;
  year?: number;
  genre?: string;
  coverArt?: string;
  size?: number;
  contentType?: string;
  suffix?: string;
  duration?: number;
  bitRate?: number;
  path?: string;
  discNumber?: number;
  created?: string;
  starred?: string;
  type?: string;
  /** How often the logged-in user played it (OpenSubsonic; Navidrome sends it). */
  playCount?: number;
  /** When the logged-in user last played it (OpenSubsonic; Navidrome sends it). */
  played?: string;
}

/** getArtistInfo2: from Last.fm, if Navidrome has it set up. */
export interface ArtistInfo2 {
  biography?: string;
  lastFmUrl?: string;
  largeImageUrl?: string;
  /** Only those in the library. */
  similarArtist?: ArtistID3[];
}

export interface Playlist {
  id: string;
  name: string;
  comment?: string;
  owner?: string;
  public?: boolean;
  songCount: number;
  duration: number;
  created: string;
  changed: string;
  coverArt?: string;
}

export interface PlaylistWithSongs extends Playlist {
  entry: Child[];
}

export interface ArtistWithAlbumsID3 extends ArtistID3 {
  album: AlbumID3[];
}

export interface AlbumWithSongsID3 extends AlbumID3 {
  song: Child[];
}

export interface SearchResult3 {
  artist?: ArtistID3[];
  album?: AlbumID3[];
  song?: Child[];
}

export interface IndexID3 {
  name: string;
  artist: ArtistID3[];
}

export interface SubsonicError {
  code: number;
  message: string;
}

/** A song someone is playing right now (getNowPlaying). */
export interface NowPlayingEntry extends Child {
  username: string;
  /** Minutes since the song started. */
  minutesAgo: number;
  playerId?: number;
  playerName?: string;
}

/** One set of lyrics from OpenSubsonic's getLyricsBySongId. */
export interface StructuredLyrics {
  displayArtist?: string;
  displayTitle?: string;
  lang: string;
  /** Milliseconds to shift every line by; positive shows lines sooner. */
  offset?: number;
  synced: boolean;
  /** `start` (milliseconds) is only set when synced. */
  line: { start?: number; value: string }[];
}

/** Legacy getLyrics: plain text only. */
export interface LyricsResult {
  artist?: string;
  title?: string;
  value?: string;
}
