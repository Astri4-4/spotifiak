import { Link } from "react-router-dom";
import type { Child } from "@/types/subsonic";
import { coverArtUrl } from "@/api/subsonic";
import { formatDuration } from "@/lib/format";
import { usePlayer } from "@/context/PlayerContext";
import { HeartIcon, PauseIcon, PlayIcon } from "./icons";

interface TrackListProps {
  tracks: Child[];
  /** Shown as the queue when any track in this list is played. Defaults to `tracks`. */
  queue?: Child[];
  showArtist?: boolean;
  showAlbum?: boolean;
  showCover?: boolean;
  starredIds?: Set<string>;
  onToggleStar?: (track: Child) => void;
}

export function TrackList({
  tracks,
  queue,
  showArtist = true,
  showAlbum = false,
  showCover = false,
  starredIds,
  onToggleStar,
}: TrackListProps) {
  const { current, isPlaying, togglePlay, playQueue } = usePlayer();

  function handleRowClick(index: number) {
    const track = tracks[index];
    if (current?.id === track.id) {
      togglePlay();
      return;
    }
    const fullQueue = queue ?? tracks;
    const startIndex = fullQueue.findIndex((t) => t.id === track.id);
    playQueue(fullQueue, startIndex === -1 ? index : startIndex);
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[2rem_1fr_auto] gap-4 border-b border-white/10 px-4 pb-2 text-xs uppercase tracking-wide text-spotify-gray sm:grid-cols-[2rem_4fr_3fr_auto]">
        <span className="text-right">#</span>
        <span>Title</span>
        <span className="hidden sm:block">{showAlbum ? "Album" : ""}</span>
        <span className="text-right">Duration</span>
      </div>
      <div className="mt-2 flex flex-col">
        {tracks.map((track, index) => {
          const isCurrent = current?.id === track.id;
          const starred = starredIds?.has(track.id) ?? Boolean(track.starred);
          return (
            <div
              key={`${track.id}-${index}`}
              onDoubleClick={() => handleRowClick(index)}
              className="group grid cursor-default grid-cols-[2rem_1fr_auto] items-center gap-4 rounded-md px-4 py-2 text-sm hover:bg-white/10 sm:grid-cols-[2rem_4fr_3fr_auto]"
            >
              <button
                type="button"
                onClick={() => handleRowClick(index)}
                className={`relative flex h-5 w-5 items-center justify-center justify-self-end text-right ${isCurrent ? "text-spotify-green" : "text-spotify-gray"}`}
                aria-label={isCurrent && isPlaying ? "Pause" : "Play"}
              >
                <span className="group-hover:hidden">
                  {isCurrent && isPlaying ? (
                    <EqualizerBars />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="hidden group-hover:block">
                  {isCurrent && isPlaying ? (
                    <PauseIcon className="h-4 w-4 fill-white" />
                  ) : (
                    <PlayIcon className="h-4 w-4 fill-white" />
                  )}
                </span>
              </button>

              <div className="flex min-w-0 items-center gap-3">
                {showCover && (
                  <img
                    src={coverArtUrl(track.coverArt, 80)}
                    alt=""
                    className="h-10 w-10 flex-shrink-0 rounded object-cover"
                  />
                )}
                <div className="min-w-0">
                  <p className={`truncate font-medium ${isCurrent ? "text-spotify-green" : "text-white"}`}>
                    {track.title}
                  </p>
                  {showArtist && track.artist && (
                    <p className="truncate text-spotify-gray">
                      {track.artistId ? (
                        <Link to={`/artist/${track.artistId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                          {track.artist}
                        </Link>
                      ) : (
                        track.artist
                      )}
                    </p>
                  )}
                </div>
              </div>

              <span className="hidden truncate self-center text-spotify-gray sm:block">
                {showAlbum && track.albumId ? (
                  <Link to={`/album/${track.albumId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {track.album}
                  </Link>
                ) : showAlbum ? (
                  track.album
                ) : null}
              </span>

              <div className="flex items-center gap-3 justify-self-end text-spotify-gray">
                {onToggleStar && (
                  <button
                    type="button"
                    onClick={() => onToggleStar(track)}
                    className={`opacity-0 transition-opacity group-hover:opacity-100 ${starred ? "!opacity-100 text-spotify-green" : ""}`}
                    aria-label={starred ? "Remove from Liked Songs" : "Save to Liked Songs"}
                  >
                    <HeartIcon filled={starred} className="h-4 w-4" />
                  </button>
                )}
                <span className="tabular-nums">{formatDuration(track.duration)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EqualizerBars() {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden>
      <span className="w-[3px] animate-pulse bg-spotify-green" style={{ height: "60%", animationDuration: "1s" }} />
      <span className="w-[3px] animate-pulse bg-spotify-green" style={{ height: "100%", animationDuration: "1.2s" }} />
      <span className="w-[3px] animate-pulse bg-spotify-green" style={{ height: "40%", animationDuration: "0.8s" }} />
    </span>
  );
}
