import { useEffect, useState, type ReactNode } from "react";
import {
  coverArtUrl,
  getAlbumList2,
  getArtists,
  getPlaylists,
  type AlbumID3,
  type ArtistID3,
  type Playlist,
} from "@/api/subsonic";
import { MediaCard } from "@/components/MediaCard";
import { Loading } from "@/components/Loading";

type Tab = "playlists" | "artists" | "albums";

const TABS: { id: Tab; label: string }[] = [
  { id: "playlists", label: "Playlists" },
  { id: "artists", label: "Artists" },
  { id: "albums", label: "Albums" },
];

export function Library() {
  const [tab, setTab] = useState<Tab>("playlists");
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [artists, setArtists] = useState<ArtistID3[] | null>(null);
  const [albums, setAlbums] = useState<AlbumID3[] | null>(null);

  useEffect(() => {
    if (tab === "playlists" && playlists === null) getPlaylists().then(setPlaylists);
    if (tab === "artists" && artists === null) getArtists().then(setArtists);
    if (tab === "albums" && albums === null) getAlbumList2("alphabeticalByName", 100).then(setAlbums);
  }, [tab, playlists, artists, albums]);

  return (
    <div className="pt-6">
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">Your Library</h1>
      <div className="mb-6 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-white text-black" : "bg-spotify-highlight-black text-white hover:bg-white/20"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "playlists" &&
        (playlists === null ? (
          <Loading />
        ) : (
          <Grid>
            {playlists.map((p) => (
              <MediaCard
                key={p.id}
                to={`/playlist/${p.id}`}
                image={coverArtUrl(p.coverArt)}
                title={p.name}
                subtitle={`${p.songCount} songs`}
              />
            ))}
          </Grid>
        ))}

      {tab === "artists" &&
        (artists === null ? (
          <Loading />
        ) : (
          <Grid>
            {artists.map((a) => (
              <MediaCard
                key={a.id}
                to={`/artist/${a.id}`}
                image={coverArtUrl(a.coverArt)}
                title={a.name}
                subtitle="Artist"
                round
              />
            ))}
          </Grid>
        ))}

      {tab === "albums" &&
        (albums === null ? (
          <Loading />
        ) : (
          <Grid>
            {albums.map((a) => (
              <MediaCard
                key={a.id}
                to={`/album/${a.id}`}
                image={coverArtUrl(a.coverArt)}
                title={a.name}
                subtitle={a.artist}
              />
            ))}
          </Grid>
        ))}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{children}</div>
  );
}
