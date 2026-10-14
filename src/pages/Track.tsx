import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { coverArtUrl, getSong } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { useTrackStar } from "@/lib/trackStar";
import { openSongMenu } from "@/lib/songMenu";
import { formatDuration } from "@/lib/format";
import { DetailHeader, PlayButton } from "@/components/DetailHeader";
import { Loading } from "@/components/Loading";
import { HeartIcon, MoreIcon } from "@/components/icons";

/** One song, where shared links land: /track/:id?from=<who shared it> */
export function Track() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const sharedBy = params.get("from");
  const [song, setSong] = useState<Child | null | undefined>(undefined);
  const { playQueue, current, isPlaying, togglePlay } = usePlayer();
  const { isStarred, toggle } = useTrackStar(song ?? null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setSong(undefined);
    getSong(id)
      .then((s) => !cancelled && setSong(s))
      .catch(() => !cancelled && setSong(null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (song === undefined) return <Loading />;
  if (song === null) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-16 text-center">
        <p className="text-lg font-semibold">This song isn't on the server any more, or the link is wrong.</p>
        <Link to="/" className="rounded-full bg-white px-6 py-2 text-sm font-bold text-black">
          Go home
        </Link>
      </div>
    );
  }

  const isCurrent = current?.id === song.id;

  return (
    <div>
      {sharedBy && <p className="pt-4 text-sm text-spotify-gray">Shared by {sharedBy}</p>}
      <DetailHeader
        kind="Song"
        title={song.title}
        image={<img src={coverArtUrl(song.coverArt, 400)} alt="" className="h-full w-full rounded object-cover" />}
        meta={
          <>
            {song.artistId ? (
              <Link to={`/artist/${song.artistId}`} className="font-semibold text-white hover:underline">
                {song.artist}
              </Link>
            ) : (
              song.artist
            )}
            {song.album && (
              <>
                {" · "}
                {song.albumId ? (
                  <Link to={`/album/${song.albumId}`} className="hover:underline">
                    {song.album}
                  </Link>
                ) : (
                  song.album
                )}
              </>
            )}
            {song.year ? ` · ${song.year}` : ""}
            {song.duration ? ` · ${formatDuration(song.duration)}` : ""}
          </>
        }
      />
      <div className="mt-4 flex items-center gap-6 sm:mt-6">
        <PlayButton
          onClick={() => (isCurrent ? togglePlay() : playQueue([song]))}
          label={isCurrent && isPlaying ? "Pause" : `Play ${song.title}`}
        />
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={isStarred ? "Remove from Liked Songs" : "Save to Liked Songs"}
          className={`transition hover:scale-105 ${isStarred ? "text-spotify-green" : "text-spotify-gray hover:text-white"}`}
        >
          <HeartIcon filled={isStarred} className="h-8 w-8" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            openSongMenu({ track: song, x: rect.left, y: rect.bottom + 4 });
          }}
          aria-label="More options"
          className="text-spotify-gray hover:text-white"
        >
          <MoreIcon className="h-7 w-7 fill-current" />
        </button>
      </div>
    </div>
  );
}
