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
