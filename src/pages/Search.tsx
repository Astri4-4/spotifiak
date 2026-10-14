import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { coverArtUrl, search3, type SearchResult3 } from "@/api/subsonic";
import { MediaCard } from "@/components/MediaCard";
import { CardGrid } from "@/components/CardGrid";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { DiscoverResults } from "@/components/DiscoverResults";
import { useDiscoverConfig } from "@/lib/discover";
import { useHidden, visibleIndices } from "@/lib/hidden";

export function Search() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  // Kept in the URL, so the back button returns to the same results.
  const discoverAvailable = useDiscoverConfig()?.available ?? false;
  const discover = discoverAvailable && params.get("discover") === "1";

  function setDiscover(on: boolean) {
    const next = new URLSearchParams(params);
    if (on) next.set("discover", "1");
    else next.delete("discover");
    setParams(next, { replace: true });
  }

  const toggle = discoverAvailable && (
    <div className="flex items-center gap-3 pt-4 md:pt-6">
      <button
        type="button"
        role="switch"
        aria-checked={discover}
        onClick={() => setDiscover(!discover)}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
          discover ? "bg-spotify-green text-on-accent" : "bg-white/10 text-white hover:bg-white/20"
        }`}
      >
        Discover
      </button>
      <span className="text-sm text-spotify-gray">
        {discover ? "Searching Deezer: download what you like into your library." : "Searching your library."}
      </span>
    </div>
  );

  return (
    <>
      {toggle}
      {discover ? (
        query ? (
          <div className="pt-4 md:pt-6">
            <DiscoverResults query={query} />
          </div>
        ) : (
          <div className="pt-16 text-center text-spotify-gray">
            <p className="text-lg font-semibold text-white">Discover new music</p>
            <p>Search Deezer for songs and albums, listen to previews, and download them into your library.</p>
          </div>
        )
      ) : (
        <LibraryResults query={query} />
      )}
    </>
  );
}

function LibraryResults({ query }: { query: string }) {
  const [found, setResults] = useState<SearchResult3 | null>(null);
  const hidden = useHidden();
  // Without hidden duplicates, nor albums made only of them.
  const results = useMemo(() => {
    if (!found) return null;
    const songs = found.song ?? [];
    return {
      ...found,
      album: found.album?.filter((a) => !hidden.albums.includes(a.id)),
      song: visibleIndices(songs, hidden).map((i) => songs[i]),
    };
  }, [found, hidden]);

  useEffect(() => {
    if (!query) {
      setResults(null);
      return;
    }
    let cancelled = false;
    search3(query).then((r) => {
      if (!cancelled) setResults(r);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (!query) {
    return (
      <div className="pt-16 text-center text-spotify-gray">
        <p className="text-lg font-semibold text-white">Search your library</p>
        <p>Find artists, albums, and songs from your Navidrome server.</p>
      </div>
    );
  }

  if (!results) return <Loading label={`Searching for "${query}"...`} />;

  const hasAnything =
    (results.artist?.length ?? 0) > 0 ||
    (results.album?.length ?? 0) > 0 ||
    (results.song?.length ?? 0) > 0;

  if (!hasAnything) {
    return (
      <div className="pt-16 text-center text-spotify-gray">
        No results found for &ldquo;{query}&rdquo;.
      </div>
    );
  }

  return (
    <div className="pt-4 md:pt-6">
      {results.artist && results.artist.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">Artists</h2>
          <CardGrid rowOnPhones>
            {results.artist.map((artist) => (
              <MediaCard
                key={artist.id}
                to={`/artist/${artist.id}`}
                image={coverArtUrl(artist.coverArt)}
                title={artist.name}
                subtitle="Artist"
                round
              />
            ))}
          </CardGrid>
        </section>
      )}

      {results.album && results.album.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">Albums</h2>
          <CardGrid rowOnPhones>
            {results.album.map((album) => (
              <MediaCard
                key={album.id}
                to={`/album/${album.id}`}
                image={coverArtUrl(album.coverArt)}
                title={album.name}
                subtitle={album.artist}
              />
            ))}
          </CardGrid>
        </section>
      )}

      {results.song && results.song.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Songs</h2>
          <TrackList tracks={results.song} showAlbum showCover />
        </section>
      )}
    </div>
  );
}
