import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  coverArtUrl,
  getAlbumList2,
  getArtists,
  getPlaylists,
  type AlbumID3,
  type ArtistID3,
  type Playlist,
} from "@/api/subsonic";
import { MediaCard, MediaRow } from "@/components/MediaCard";
import { Loading } from "@/components/Loading";
import { CardGrid } from "@/components/CardGrid";
import { CreatePlaylistButton } from "@/components/CreatePlaylistButton";
import { HeartIcon, PlusIcon } from "@/components/icons";
import { PHONE_QUERY, useMediaQuery } from "@/lib/useMediaQuery";

type Tab = "playlists" | "artists" | "albums";

interface LibraryItem {
  to: string;
  image: string;
  title: string;
  subtitle?: string;
  round?: boolean;
}

const likedSongsArt = (
  <span className="flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-indigo-700 to-blue-300">
    <HeartIcon filled className="h-1/3 w-1/3 text-white" />
  </span>
);

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

  // Phones get a compact list, larger screens a grid of cards.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const items: LibraryItem[] | null =
    tab === "playlists"
      ? (playlists?.map((p) => ({ to: `/playlist/${p.id}`, image: coverArtUrl(p.coverArt), title: p.name, subtitle: `${p.songCount} songs` })) ?? null)
      : tab === "artists"
        ? (artists?.map((a) => ({ to: `/artist/${a.id}`, image: coverArtUrl(a.coverArt), title: a.name, subtitle: "Artist", round: true })) ?? null)
        : (albums?.map((a) => ({ to: `/album/${a.id}`, image: coverArtUrl(a.coverArt), title: a.name, subtitle: a.artist })) ?? null);

  return (
    <div className="pt-4 md:pt-6">
      <div className="mb-4 flex items-center justify-between gap-4 md:mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">Your Library</h1>
        {/* The sidebar (with its own + button) is hidden on phones. */}
        <CreatePlaylistButton onCreated={() => setPlaylists(null)}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full text-spotify-gray hover:bg-white/10 hover:text-white md:hidden">
            <PlusIcon className="h-6 w-6" />
          </span>
        </CreatePlaylistButton>
      </div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:mb-6 md:px-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-white text-black" : "bg-spotify-highlight-black text-white hover:bg-white/20"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <Loading />
      ) : isPhone ? (
        <div className="flex flex-col">
          {tab === "playlists" && <MediaRow to="/liked" image={likedSongsArt} title="Liked Songs" subtitle="Playlist" />}
          {items.map((item) => (
            <MediaRow key={item.to} {...item} />
          ))}
        </div>
      ) : (
        <CardGrid>
          {tab === "playlists" && (
            <Link
              to="/liked"
              className="flex flex-col gap-3 rounded-md bg-spotify-elevated-black/60 p-3 transition-colors hover:bg-spotify-highlight-black sm:p-4"
            >
              <span className="aspect-square w-full shadow-lg">{likedSongsArt}</span>
              <p className="truncate font-semibold text-white">Liked Songs</p>
            </Link>
          )}
          {items.map((item) => (
            <MediaCard key={item.to} {...item} />
          ))}
        </CardGrid>
      )}
    </div>
  );
}
