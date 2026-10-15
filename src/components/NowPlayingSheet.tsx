import { useRef, useState, type TouchEvent } from "react";
import { Link } from "react-router-dom";
import { useConnect, usePlayer } from "@/context/PlayerContext";
import { DevicePicker } from "./DevicePicker";
import { LyricsView } from "./LyricsView";
import { useJam } from "@/context/JamContext";
import { coverArtUrl } from "@/api/subsonic";
import { formatDuration } from "@/lib/format";
import { useNowPlayingSheet } from "@/lib/nowPlayingSheet";
import { useTrackStar } from "@/lib/trackStar";
import { openSongMenu } from "@/lib/songMenu";
import { isEpisode } from "@/lib/podcasts";
import { SkipBackButton, SkipForwardButton, SpeedButton } from "./PodcastControls";
import {
  ChevronDownIcon,
  HeartIcon,
  JamIcon,
  LyricsIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
  SkipNextIcon,
  SkipPrevIcon,
} from "./icons";

/** How far (px) the view must be dragged down to close it. */
const DISMISS_DISTANCE = 120;

/**
 * Full-screen player for phones, opened by tapping the mini-player. Its links
 * don't need to close it: the open flag belongs to the current history entry
 * (see useNowPlayingSheet), so navigating anywhere leaves it behind.
 */
export function NowPlayingSheet() {
  const {
    current,
    isPlaying,
    progress,
    duration,
    shuffle,
    repeat,
    togglePlay,
    playNext,
    playPrevious,
    seek,
    toggleShuffle,
    cycleRepeat,
    inJam,
    canControl,
    audioBlocked,
  } = usePlayer();
  const { jam } = useJam();
  const { remoteDevice, thisDevice } = useConnect();
  const { isOpen, close } = useNowPlayingSheet();
  const { isStarred, toggle: toggleStar } = useTrackStar(current);

  // Swipe down to close: follow the finger, then close or spring back.
  const dragStartRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  // Lyrics take the cover's place; they stay on from song to song until turned off.
  const [showLyrics, setShowLyrics] = useState(false);

  if (!isOpen || !current) return null;

  const canTogglePlay = canControl || audioBlocked;
  const total = duration || current.duration || 0;
  // Podcast episodes: no likes or lyrics, skip buttons instead of shuffle/repeat, and a speed.
  const episode = isEpisode(current);
  const showLink = episode && current.podcastId ? `/podcast/${current.podcastId}` : null;

  function onTouchStart(e: TouchEvent) {
    dragStartRef.current = e.touches[0].clientY;
  }
  function onTouchMove(e: TouchEvent) {
    if (dragStartRef.current === null) return;
    setDragY(Math.max(0, e.touches[0].clientY - dragStartRef.current));
  }
  function onTouchEnd() {
    dragStartRef.current = null;
    if (dragY > DISMISS_DISTANCE) close();
    setDragY(0);
  }
  const dragHandlers = { onTouchStart, onTouchMove, onTouchEnd };

  return (
    <div
      role="dialog"
      aria-label="Now playing"
      className="fixed inset-0 z-50 flex animate-slide-up flex-col overflow-hidden bg-spotify-base-black md:hidden"
      style={{
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragStartRef.current === null ? "transform 0.2s ease-out" : "none",
      }}
    >
      {/* The cover, blurred, tints the background like Spotify's. */}
      <img
        src={coverArtUrl(current.coverArt, 80)}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-3xl"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/50 to-black" />

      <div className="relative flex min-h-0 flex-1 flex-col px-6 pb-[calc(var(--safe-bottom)+1.5rem)] pt-[calc(var(--safe-top)+0.5rem)]">
        {/* Header and cover are the drag handle; the controls below stay tappable, and lyrics scroll. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2" {...dragHandlers}>
            <button type="button" onClick={close} aria-label="Close" className="-ml-2 flex h-11 w-11 items-center justify-center">
              <ChevronDownIcon className="h-7 w-7" />
            </button>
            <div className="min-w-0 text-center">
              <p className="text-[11px] uppercase tracking-widest text-white/70">
                {inJam ? "Playing in Jam" : episode ? "Playing podcast" : "Playing from album"}
              </p>
              <p className="truncate text-sm font-bold">
                {inJam ? `${jam?.members.length ?? 1} listening` : current.album}
              </p>
            </div>
            {inJam ? (
              <Link to="/jam" aria-label="Open Jam" className="-mr-2 flex h-11 w-11 items-center justify-center text-spotify-green">
                <JamIcon className="h-6 w-6" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  openSongMenu({ track: current, x: rect.left, y: rect.bottom });
                }}
                aria-label="More options"
                className="-mr-2 flex h-11 w-11 items-center justify-center"
              >
                <MoreIcon className="h-6 w-6 fill-current" />
              </button>
            )}
          </div>

          {showLyrics && !episode ? (
            <div className="flex min-h-0 flex-1 flex-col py-4">
              <LyricsView track={current} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center py-6" {...dragHandlers}>
              <img
                src={coverArtUrl(current.coverArt, 600)}
                alt=""
                className="aspect-square max-h-full w-full max-w-md rounded-lg object-cover shadow-2xl"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-2xl font-bold">
              {showLink ? (
                <Link to={showLink}>{current.title}</Link>
              ) : current.albumId ? (
                <Link to={`/album/${current.albumId}`}>
                  {current.title}
                </Link>
              ) : (
                current.title
              )}
            </p>
            <p className="truncate text-base text-white/70">
              {showLink ? (
                <Link to={showLink}>{current.artist}</Link>
              ) : current.artistId ? (
                <Link to={`/artist/${current.artistId}`}>
                  {current.artist}
                </Link>
              ) : (
                current.artist
              )}
            </p>
          </div>
          {!episode && (
            <button
              type="button"
              onClick={toggleStar}
              aria-label={isStarred ? "Remove from Liked Songs" : "Save to Liked Songs"}
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center ${isStarred ? "text-spotify-green" : "text-white"}`}
            >
              <HeartIcon filled={isStarred} className="h-7 w-7" />
            </button>
          )}
        </div>

        <div className="mt-5">
          <input
            type="range"
            aria-label="Seek"
            className="spotify-slider"
            min={0}
            max={total}
            value={Math.min(progress, total)}
            disabled={!canControl}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <div className="mt-2 flex justify-between text-xs tabular-nums text-white/70">
            <span>{formatDuration(progress)}</span>
            <span>{formatDuration(total)}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          {episode ? (
            <SkipBackButton className="flex h-12 w-12 items-center justify-center" iconClassName="h-8 w-8" />
          ) : (
            <button
              type="button"
              onClick={toggleShuffle}
              aria-label="Shuffle"
              // A Jam plays its queue in order; keep the slot so controls don't shift.
              className={`flex h-12 w-12 items-center justify-center ${inJam ? "invisible" : ""} ${shuffle ? "text-spotify-green" : "text-white"}`}
            >
              <ShuffleIcon className="h-6 w-6" />
            </button>
          )}
          <button
            type="button"
            onClick={playPrevious}
            disabled={!canControl}
            aria-label="Previous"
            className="flex h-14 w-14 items-center justify-center disabled:opacity-40"
          >
            <SkipPrevIcon className="h-9 w-9 fill-current" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={!canTogglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-white text-black transition active:scale-95 disabled:opacity-40"
          >
            {isPlaying ? <PauseIcon className="h-8 w-8 fill-current" /> : <PlayIcon className="h-8 w-8 fill-current pl-1" />}
          </button>
          <button
            type="button"
            onClick={playNext}
            disabled={!canControl}
            aria-label="Next"
            className="flex h-14 w-14 items-center justify-center disabled:opacity-40"
          >
            <SkipNextIcon className="h-9 w-9 fill-current" />
          </button>
          {episode ? (
            <SkipForwardButton className="flex h-12 w-12 items-center justify-center" iconClassName="h-8 w-8" />
          ) : (
            <button
              type="button"
              onClick={cycleRepeat}
              aria-label="Repeat"
              className={`relative flex h-12 w-12 items-center justify-center ${inJam ? "invisible" : ""} ${repeat !== "off" ? "text-spotify-green" : "text-white"}`}
            >
              <RepeatIcon className="h-6 w-6" />
              {repeat === "one" && <span className="absolute right-1.5 top-1.5 text-[10px] font-bold">1</span>}
            </button>
          )}
        </div>

        <div className="mt-4 flex min-h-[1.5rem] items-center">
          <DevicePicker label className="max-w-full" />
          {!remoteDevice && <span className="ml-2 truncate text-xs text-white/60">{thisDevice.name}</span>}
          {episode ? (
            <>
              <span className="ml-auto" />
              <SpeedButton hidden={inJam || Boolean(remoteDevice)} className="h-11 min-w-[2.75rem] px-1 text-sm text-white" />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setShowLyrics((v) => !v)}
              aria-label={showLyrics ? "Hide lyrics" : "Show lyrics"}
              aria-pressed={showLyrics}
              className={`ml-auto flex h-11 w-11 flex-shrink-0 items-center justify-center ${showLyrics ? "text-spotify-green" : "text-white"}`}
            >
              <LyricsIcon className="h-6 w-6" />
            </button>
          )}
          <Link
            to={inJam ? "/jam" : "/queue"}
            aria-label="Queue"
            className="-mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center"
          >
            <QueueIcon className="h-6 w-6" />
          </Link>
        </div>
      </div>
    </div>
  );
}
