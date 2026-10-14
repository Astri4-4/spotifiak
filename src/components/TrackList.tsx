import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import type { Child } from "@/types/subsonic";
import { coverArtUrl } from "@/api/subsonic";
import { formatDuration } from "@/lib/format";
import { usePlayer } from "@/context/PlayerContext";
import { openSongMenu } from "@/lib/songMenu";
import { CheckIcon, HeartIcon, MoreIcon, PauseIcon, PlayIcon, QueueAddIcon } from "./icons";
import { SelectionBar } from "./SelectionBar";

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
  /** Offers "Remove from this playlist" in the song menu. */
  onRemoveFromPlaylist?: (index: number) => void;
  /** Offers removing the selected songs (their positions in `tracks`). */
  onRemoveManyFromPlaylist?: (indices: number[]) => void;
  /** A short note after the artist, e.g. whose top songs a mix's song comes from. */
  rowNote?: (index: number) => string | undefined;
}

export function TrackList({
  tracks,
  queue,
  showArtist = true,
  showAlbum = false,
  showCover = false,
  starredIds,
  onToggleStar,
  onRemoveFromPlaylist,
  onRemoveManyFromPlaylist,
  rowNote,
}: TrackListProps) {
  const { current, isPlaying, togglePlay, playQueue, enqueue, inJam } = usePlayer();
  const [justQueued, setJustQueued] = useState<string | null>(null);
  // Several songs picked at once: from "Select" in the song menu, or
  // Ctrl/Cmd-click and Shift-click. Positions in `tracks`.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const selecting = selected.size > 0;
  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setAnchor(null);
  }, []);
  // Another list (sorted, searched, reloaded): start over.
  const tracksKey = tracks.map((t) => t.id).join(",");
  useEffect(clearSelection, [tracksKey, clearSelection]);

  const isStarred = (track: Child) => starredIds?.has(track.id) ?? Boolean(track.starred);

  function toggleSelected(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
    setAnchor(index);
  }

  function selectRange(to: number) {
    const from = anchor ?? to;
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(i);
      return next;
    });
  }

  /** Single click: picks songs while selecting (or with a modifier key); plays on touch screens. */
  function handleClick(e: MouseEvent, index: number) {
    if (e.shiftKey && (selecting || anchor !== null)) {
      e.preventDefault();
      selectRange(index);
    } else if (e.metaKey || e.ctrlKey || selecting) {
      toggleSelected(index);
    } else {
      setAnchor(index);
      if (window.matchMedia("(hover: none)").matches) handleRowClick(index);
    }
  }

  function handleQueue(track: Child) {
    enqueue([track]);
    setJustQueued(track.id);
    window.setTimeout(() => setJustQueued((id) => (id === track.id ? null : id)), 1500);
  }

  function openMenu(index: number, x: number, y: number) {
    const track = tracks[index];
    openSongMenu({
      track,
      x,
      y,
      starred: starredIds ? starredIds.has(track.id) : undefined,
      onToggleStar: onToggleStar && (() => onToggleStar(track)),
      onRemoveFromPlaylist: onRemoveFromPlaylist && (() => onRemoveFromPlaylist(index)),
      onSelect: () => toggleSelected(index),
    });
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
          const starred = isStarred(track);
          const isSelected = selected.has(index);
          const note = rowNote?.(index);
          return (
            <div
              key={`${track.id}-${index}`}
              onDoubleClick={() => !selecting && handleRowClick(index)}
              aria-selected={selecting ? isSelected : undefined}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(index, e.clientX, e.clientY);
              }}
              // Touch screens have no double-click: a single tap plays the row.
              onClick={(e) => handleClick(e, index)}
              className={`group grid cursor-default select-none items-center gap-3 rounded-md px-2 py-2 text-sm active:bg-white/10 md:gap-4 md:px-4 ${COLUMNS} ${
                isSelected ? "bg-white/20 hover:bg-white/25" : "hover:bg-white/10"
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (selecting) toggleSelected(index);
                  else handleRowClick(index);
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
                {selecting && (
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                      isSelected ? "border-spotify-green bg-spotify-green text-on-accent" : "border-spotify-gray"
                    }`}
                  >
                    {isSelected && <CheckIcon className="h-3 w-3" />}
                  </span>
                )}
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
                      {note && <span> · {note}</span>}
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
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    openMenu(index, rect.right - 256, rect.bottom + 4);
                  }}
                  className="flex h-8 w-8 items-center justify-center hover:text-white md:h-auto md:w-auto md:opacity-0 md:group-hover:opacity-100"
                  aria-label={`More options for ${track.title}`}
                  title="More options"
                >
                  <MoreIcon className="h-4 w-4 fill-current" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {selecting && (
        <SelectionBar
          tracks={[...selected].sort((a, b) => a - b).map((i) => tracks[i])}
          allSelected={selected.size === tracks.length}
          isStarred={isStarred}
          onToggleStar={onToggleStar}
          onRemove={onRemoveManyFromPlaylist && (() => onRemoveManyFromPlaylist([...selected]))}
          onSelectAll={() => setSelected(new Set(tracks.map((_, i) => i)))}
          onClear={clearSelection}
        />
      )}
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
