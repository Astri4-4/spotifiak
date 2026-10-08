import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { coverArtUrl, search3, type SearchResult3 } from "@/api/subsonic";
import { MediaCard } from "@/components/MediaCard";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";

export function Search() {
  const [params] = useSearchParams();
  const query = params.get("q")?.trim() ?? "";
  const [results, setResults] = useState<SearchResult3 | null>(null);

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
    <div className="pt-6">
      {results.artist && results.artist.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">Artists</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
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
          </div>
        </section>
      )}

      {results.album && results.album.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">Albums</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {results.album.map((album) => (
              <MediaCard
                key={album.id}
                to={`/album/${album.id}`}
                image={coverArtUrl(album.coverArt)}
                title={album.name}
                subtitle={album.artist}
              />
            ))}
          </div>
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
