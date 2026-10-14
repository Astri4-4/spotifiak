import { Link, Navigate } from "react-router-dom";
import { usePlayer } from "@/context/PlayerContext";
import { coverArtUrl } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { useDragReorder } from "@/lib/useDragReorder";
import { CloseIcon, DragHandleIcon, PauseIcon, PlayIcon } from "@/components/icons";
import { Jam } from "./Jam";

/**
 * The player's queue: what's playing and what's next, to play, remove or
 * reorder. A page on narrow screens; in the side panel (`panel`) on wide ones.
 */
export function Queue({ panel = false }: { panel?: boolean }) {
  const { queue, currentIndex, current, isPlaying, shuffle, inJam, togglePlay, jumpTo, removeAt, moveTrack } =
    usePlayer();
  // A Jam's queue is shared, and shown (with who added what) on the Jam page.
  const first = currentIndex + 1;
  const { dragging, itemProps, handleProps } = useDragReorder((from, to) => moveTrack(first + from, first + to));

  // In a Jam, its queue is the Jam's.
  if (inJam) return panel ? <Jam panel /> : <Navigate to="/jam" replace />;

  const nextUp = queue.slice(first);

  return (
    <div className={`flex flex-col ${panel ? "gap-6" : "gap-8 pt-4 md:pt-6"}`}>
      {!panel && <h1 className="text-2xl font-bold sm:text-3xl">Queue</h1>}

      <section>
        <h2 className={`mb-3 font-bold ${panel ? "text-base" : "text-xl"}`}>Now playing</h2>
        {current ? (
          <div className="flex items-center gap-3 rounded-md p-2 hover:bg-white/10">
            <button
              type="button"
              onClick={togglePlay}
              className="group relative flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              <span className="relative h-12 w-12 flex-shrink-0">
                <img src={coverArtUrl(current.coverArt, 80)} alt="" className="h-full w-full rounded object-cover" />
                <span className="absolute inset-0 hidden items-center justify-center rounded bg-black/50 group-hover:flex">
                  {isPlaying ? <PauseIcon className="h-5 w-5 fill-white" /> : <PlayIcon className="h-5 w-5 fill-white" />}
                </span>
              </span>
              <TrackText track={current} highlight />
            </button>
          </div>
        ) : (
          <p className="text-spotify-gray">
            Nothing is playing.{" "}
            <Link to="/search" className="font-semibold text-white hover:underline">
              Find something to play
            </Link>
          </p>
        )}
      </section>

      {current && (
        <section>
          <h2 className={`mb-1 font-bold ${panel ? "text-base" : "text-xl"}`}>Next up</h2>
          {shuffle && (
            <p className="mb-3 text-sm text-spotify-gray">Shuffle is on: the next song is picked at random from this list.</p>
          )}
          {nextUp.length === 0 ? (
            <p className="mt-3 text-spotify-gray">Nothing after this song.</p>
          ) : (
            <div className={`mt-2 flex flex-col ${dragging ? "select-none" : ""}`}>
              {nextUp.map((track, position) => {
                const index = first + position;
                return (
                  <div
                    key={`${index}-${track.id}`}
                    {...itemProps(position)}
                    className="group flex items-center gap-2 rounded-md p-2 hover:bg-white/10 data-[dragging]:bg-spotify-highlight-black data-[dragging]:shadow-xl"
                  >
                    <span
                      {...handleProps(position)}
                      aria-label={`Drag to move ${track.title}`}
                      className="flex h-8 w-6 flex-shrink-0 items-center justify-center text-spotify-gray hover:text-white md:opacity-0 md:group-hover:opacity-100"
                    >
                      <DragHandleIcon className="h-4 w-4 fill-current" />
                    </span>
                    <button
                      type="button"
                      onClick={() => jumpTo(index)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      aria-label={`Play ${track.title} now`}
                    >
                      <img src={coverArtUrl(track.coverArt, 80)} alt="" className="h-12 w-12 flex-shrink-0 rounded object-cover" />
                      <TrackText track={track} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      aria-label={`Remove ${track.title} from the queue`}
                      title="Remove from queue"
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-spotify-gray hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TrackText({ track, highlight = false }: { track: Child; highlight?: boolean }) {
  return (
    <span className="min-w-0">
      <span className={`block truncate font-medium ${highlight ? "text-spotify-green" : "text-white"}`}>{track.title}</span>
      <span className="block truncate text-sm text-spotify-gray">{track.artist}</span>
    </span>
  );
}
