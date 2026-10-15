import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  coverArtUrl,
  getAllAlbums,
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
import { CalendarIcon, HeartIcon, MixIcon, PlusIcon, PodcastIcon } from "@/components/icons";
import { PHONE_QUERY, useMediaQuery } from "@/lib/useMediaQuery";
import { ListControls } from "@/components/ListControls";
import { byText, matches, useSortChoice, type SortOption } from "@/lib/listSort";
import { useVisibleAlbums } from "@/lib/hidden";
import { SMART_PLAYLISTS } from "@/lib/smartPlaylists";
import { SmartPlaylistArt } from "@/components/SmartPlaylistArt";
import { useLikedCollections } from "@/lib/collectionStar";

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
    <HeartIcon filled className="h-1/3 w-1/3 text-pure-white" />
  </span>
);

const mixesArt = (
  <span className="flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-spotify-green to-fuchsia-500">
    <MixIcon className="h-1/3 w-1/3 text-pure-white" />
  </span>
);

const podcastsArt = (
  <span className="flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-teal-700 to-amber-300">
    <PodcastIcon className="h-1/3 w-1/3 text-pure-white" />
  </span>
);

const calendarArt = (
  <span className="flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-rose-600 to-orange-300">
    <CalendarIcon className="h-1/3 w-1/3 text-pure-white" />
  </span>
);

const newest = (a: string | undefined, b: string | undefined) => byText(b, a);

const PLAYLIST_SORTS: SortOption<Playlist>[] = [
  { id: "changed", label: "Recently updated", compare: (a, b) => newest(a.changed, b.changed) },
  { id: "created", label: "Recently created", compare: (a, b) => newest(a.created, b.created) },
  { id: "name", label: "Name", compare: (a, b) => byText(a.name, b.name) },
  { id: "songs", label: "Most songs", compare: (a, b) => b.songCount - a.songCount },
];
const ARTIST_SORTS: SortOption<ArtistID3>[] = [
  { id: "name", label: "Name", compare: (a, b) => byText(a.name, b.name) },
  { id: "albums", label: "Most albums", compare: (a, b) => (b.albumCount ?? 0) - (a.albumCount ?? 0) || byText(a.name, b.name) },
];
const ALBUM_SORTS: SortOption<AlbumID3>[] = [
  { id: "name", label: "Name", compare: (a, b) => byText(a.name, b.name) },
  { id: "artist", label: "Artist", compare: (a, b) => byText(a.artist, b.artist) || (a.year ?? 0) - (b.year ?? 0) },
  { id: "added", label: "Recently added", compare: (a, b) => newest(a.created, b.created) },
  { id: "played", label: "Recently played", compare: (a, b) => newest(a.played, b.played) },
  { id: "year", label: "Release year", compare: (a, b) => (b.year ?? 0) - (a.year ?? 0) || byText(a.name, b.name) },
];

function sortAndFilter<T>(items: T[] | null, sort: SortOption<T>, query: string, fields: (item: T) => (string | undefined)[]) {
  if (!items) return null;
  const found = items.filter((item) => matches(query, ...fields(item)));
  return sort.compare ? found.sort(sort.compare) : found;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "playlists", label: "Playlists" },
  { id: "artists", label: "Artists" },
  { id: "albums", label: "Albums" },
];

export function Library() {
  const [tab, setTab] = useState<Tab>("playlists");
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [artists, setArtists] = useState<ArtistID3[] | null>(null);
  const [allAlbums, setAlbums] = useState<AlbumID3[] | null>(null);
  const [query, setQuery] = useState("");
  // Artists and albums: only the ones you liked.
  const [likedOnly, setLikedOnly] = useState(false);
  const liked = useLikedCollections();
  const [playlistSort, setPlaylistSort] = useSortChoice("library.playlists", PLAYLIST_SORTS);
  const [artistSort, setArtistSort] = useSortChoice("library.artists", ARTIST_SORTS);
  const [albumSort, setAlbumSort] = useSortChoice("library.albums", ALBUM_SORTS);
  // Albums made only of hidden duplicates (singles...) aren't listed.
  const visibleAlbums = useVisibleAlbums(allAlbums ?? []);
  const albums = allAlbums && visibleAlbums;

  useEffect(() => {
    if (tab === "playlists" && playlists === null) getPlaylists().then(setPlaylists);
    if (tab === "artists" && artists === null) getArtists().then(setArtists);
    if (tab === "albums" && allAlbums === null) getAllAlbums().then(setAlbums);
  }, [tab, playlists, artists, allAlbums]);

  const shownPlaylists = useMemo(() => sortAndFilter(playlists, playlistSort, query, (p) => [p.name, p.comment]), [playlists, playlistSort, query]);
  const shownArtists = useMemo(
    () => sortAndFilter(likedOnly ? (artists?.filter((a) => liked.artist.has(a.id)) ?? null) : artists, artistSort, query, (a) => [a.name]),
    [artists, artistSort, query, likedOnly, liked.artist],
  );
  const shownAlbums = useMemo(
    () => sortAndFilter(likedOnly ? (albums?.filter((a) => liked.album.has(a.id)) ?? null) : albums, albumSort, query, (a) => [a.name, a.artist]),
    [albums, albumSort, query, likedOnly, liked.album],
  );

  // Liked Songs, Mixes and the smart playlists, before the playlists.
  const specials =
    tab === "playlists"
      ? [
          { to: "/liked", art: likedSongsArt, title: "Liked Songs", subtitle: "Playlist" },
          { to: "/mixes", art: mixesArt, title: "Mixes", subtitle: "Blended with friends" },
          { to: "/podcasts", art: podcastsArt, title: "Podcasts", subtitle: "Your shows and new episodes" },
          { to: "/calendar", art: calendarArt, title: "Calendar", subtitle: "Releases and concerts of artists you follow" },
          ...SMART_PLAYLISTS.map((p) => ({ to: `/smart/${p.id}`, art: <SmartPlaylistArt playlist={p} />, title: p.name, subtitle: p.description })),
        ].filter((item) => matches(query, item.title))
      : [];

  const filteringLiked = likedOnly && tab !== "playlists";

  // Phones get a compact list, larger screens a grid of cards.
  const isPhone = useMediaQuery(PHONE_QUERY);
  const items: LibraryItem[] | null =
    tab === "playlists"
      ? (shownPlaylists?.map((p) => ({ to: `/playlist/${p.id}`, image: coverArtUrl(p.coverArt), title: p.name, subtitle: `${p.songCount} songs` })) ?? null)
      : tab === "artists"
        ? (shownArtists?.map((a) => ({ to: `/artist/${a.id}`, image: coverArtUrl(a.coverArt), title: a.name, subtitle: "Artist", round: true })) ?? null)
        : (shownAlbums?.map((a) => ({ to: `/album/${a.id}`, image: coverArtUrl(a.coverArt), title: a.name, subtitle: a.artist })) ?? null);

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
            onClick={() => {
              setTab(t.id);
              setQuery("");
            }}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === t.id ? "bg-white text-black" : "bg-spotify-highlight-black text-white hover:bg-white/20"
            }`}
          >
            {t.label}
          </button>
        ))}
        {tab !== "playlists" && (
          <button
            type="button"
            aria-pressed={likedOnly}
            onClick={() => setLikedOnly((v) => !v)}
            className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              likedOnly ? "bg-spotify-green text-on-accent" : "bg-spotify-highlight-black text-white hover:bg-white/20"
            }`}
          >
            <HeartIcon filled={likedOnly} className="h-3.5 w-3.5" />
            Liked
          </button>
        )}
      </div>

      <div className="mb-4 md:mb-6">
        {tab === "playlists" ? (
          <ListControls query={query} onQuery={setQuery} placeholder="Search in playlists" sort={playlistSort} sorts={PLAYLIST_SORTS} onSort={setPlaylistSort} />
        ) : tab === "artists" ? (
          <ListControls query={query} onQuery={setQuery} placeholder="Search in artists" sort={artistSort} sorts={ARTIST_SORTS} onSort={setArtistSort} />
        ) : (
          <ListControls query={query} onQuery={setQuery} placeholder="Search in albums" sort={albumSort} sorts={ALBUM_SORTS} onSort={setAlbumSort} />
        )}
      </div>

      {items === null || (filteringLiked && !liked.loaded) ? (
        <Loading />
      ) : filteringLiked && items.length === 0 && !query ? (
        <p className="pt-8 text-center text-sm text-spotify-gray">
          No liked {tab} yet. Tap the heart on {tab === "albums" ? "an album" : "an artist"}'s page to find it here.
        </p>
      ) : isPhone ? (
        <div className="flex flex-col">
          {specials.map((item) => (
            <MediaRow key={item.to} to={item.to} image={item.art} title={item.title} subtitle={item.subtitle} />
          ))}
          {items.map((item) => (
            <MediaRow key={item.to} {...item} />
          ))}
        </div>
      ) : (
        <CardGrid>
          {specials.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="flex min-w-0 flex-col gap-3 rounded-md bg-spotify-elevated-black/60 p-3 transition-colors hover:bg-spotify-highlight-black sm:p-4"
            >
              <span className="aspect-square w-full shadow-lg">{item.art}</span>
              <span className="min-w-0">
                <p className="truncate font-semibold text-white">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-spotify-gray">{item.subtitle}</p>
              </span>
            </Link>
          ))}
          {items.map((item) => (
            <MediaCard key={item.to} {...item} />
          ))}
        </CardGrid>
      )}
    </div>
  );
}
