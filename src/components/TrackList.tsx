import { useState } from "react";
import { Link } from "react-router-dom";
import type { Child } from "@/types/subsonic";
import { coverArtUrl } from "@/api/subsonic";
import { formatDuration } from "@/lib/format";
import { usePlayer } from "@/context/PlayerContext";
import { CheckIcon, HeartIcon, PauseIcon, PlayIcon, QueueAddIcon } from "./icons";

// Phones: title | actions. md: # | title | actions. lg+: # | title | album | actions.
const COLUMNS =
  "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[2rem_minmax(0,1fr)_auto] lg:grid-cols-[2rem_minmax(0,4fr)_minmax(0,3fr)_auto]";

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
  const { current, isPlaying, togglePlay, playQueue, enqueue, inJam } = usePlayer();
  const [justQueued, setJustQueued] = useState<string | null>(null);

  function handleQueue(track: Child) {
    enqueue([track]);
    setJustQueued(track.id);
    window.setTimeout(() => setJustQueued((id) => (id === track.id ? null : id)), 1500);
  }

  function handleRowClick(index: number) {
    const track = tracks[index];
    if (current?.id === track.id) {
      togglePlay();
      return;
    }
    if (inJam) {
      // Don't flood a shared queue with the rest of the album/playlist.
      playQueue([track]);
      return;
    }
    const fullQueue = queue ?? tracks;
    const startIndex = fullQueue.findIndex((t) => t.id === track.id);
    playQueue(fullQueue, startIndex === -1 ? index : startIndex);
  }

  return (
    <div className="flex flex-col">
      <div className={`hidden gap-4 border-b border-white/10 px-4 pb-2 text-xs uppercase tracking-wide text-spotify-gray md:grid ${COLUMNS}`}>
        <span className="text-right">#</span>
        <span>Title</span>
        <span className="hidden lg:block">{showAlbum ? "Album" : ""}</span>
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
              // Touch screens have no double-click: a single tap plays the row.
              onClick={() => {
                if (window.matchMedia("(hover: none)").matches) handleRowClick(index);
              }}
              className={`group grid cursor-default items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-white/10 active:bg-white/10 md:gap-4 md:px-4 ${COLUMNS}`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRowClick(index);
                }}
                className={`relative hidden h-5 w-5 items-center justify-center justify-self-end text-right md:flex ${isCurrent ? "text-spotify-green" : "text-spotify-gray"}`}
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

              <span className="hidden truncate self-center text-spotify-gray lg:block">
                {showAlbum && track.albumId ? (
                  <Link to={`/album/${track.albumId}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
                    {track.album}
                  </Link>
                ) : showAlbum ? (
                  track.album
                ) : null}
              </span>

              <div className="flex items-center gap-2 justify-self-end text-spotify-gray md:gap-3">
                {inJam && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQueue(track);
                    }}
                    className={`flex h-8 w-8 items-center justify-center hover:text-white md:h-auto md:w-auto md:opacity-0 md:group-hover:opacity-100 ${
                      justQueued === track.id ? "!opacity-100 text-spotify-green" : ""
                    }`}
                    aria-label="Add to Jam queue"
                    title="Add to Jam queue"
                  >
                    {justQueued === track.id ? <CheckIcon className="h-4 w-4" /> : <QueueAddIcon className="h-4 w-4" />}
                  </button>
                )}
                {onToggleStar && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(track);
                    }}
                    className={`flex h-8 w-8 items-center justify-center transition-opacity md:h-auto md:w-auto md:opacity-0 md:group-hover:opacity-100 ${starred ? "!opacity-100 text-spotify-green" : ""}`}
                    aria-label={starred ? "Remove from Liked Songs" : "Save to Liked Songs"}
                  >
                    <HeartIcon filled={starred} className="h-4 w-4" />
                  </button>
                )}
                <span className="hidden tabular-nums sm:inline">{formatDuration(track.duration)}</span>
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
