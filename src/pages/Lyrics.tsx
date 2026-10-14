import { Link } from "react-router-dom";
import { usePlayer } from "@/context/PlayerContext";
import { coverArtUrl } from "@/api/subsonic";
import { LyricsView } from "@/components/LyricsView";

/** The playing song's lyrics, opened from the desktop player's lyrics button. */
export function Lyrics() {
  const { current } = usePlayer();

  if (!current) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <p className="text-lg font-bold">Nothing playing</p>
        <p className="mt-1 text-sm text-spotify-gray">Play a song to see its lyrics here.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col pt-4 md:pt-6">
      <div className="flex items-center gap-4">
        <img src={coverArtUrl(current.coverArt, 160)} alt="" className="h-16 w-16 flex-shrink-0 rounded object-cover shadow-lg" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">
            {current.albumId ? (
              <Link to={`/album/${current.albumId}`} className="hover:underline">
                {current.title}
              </Link>
            ) : (
              current.title
            )}
          </h1>
          <p className="truncate text-sm text-spotify-gray">
            {current.artistId ? (
              <Link to={`/artist/${current.artistId}`} className="hover:underline">
                {current.artist}
              </Link>
            ) : (
              current.artist
            )}
          </p>
        </div>
      </div>
      <LyricsView track={current} page />
    </div>
  );
}
