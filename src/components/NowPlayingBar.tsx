import { Link } from "react-router-dom";
import { usePlayer } from "@/context/PlayerContext";
import { useJam } from "@/context/JamContext";
import { coverArtUrl } from "@/api/subsonic";
import { formatDuration } from "@/lib/format";
import { useNowPlayingSheet } from "@/lib/nowPlayingSheet";
import { useTrackStar } from "@/lib/trackStar";
import {
  HeartIcon,
  JamIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  ShuffleIcon,
  SkipNextIcon,
  SkipPrevIcon,
  VolumeIcon,
} from "./icons";

export function NowPlayingBar() {
  const {
    current,
    isPlaying,
    progress,
    duration,
    volume,
    shuffle,
    repeat,
    togglePlay,
    playNext,
    playPrevious,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    inJam,
    canControl,
    audioBlocked,
  } = usePlayer();
  const { jam } = useJam();
  // Guests without control can't pause/skip - except to start audio the browser blocked.
  const canTogglePlay = canControl || audioBlocked;

  const { isStarred, toggle: toggleStar } = useTrackStar(current);
  const { open: openSheet } = useNowPlayingSheet();

  if (!current) {
    return (
      <footer className="hidden h-20 flex-shrink-0 items-center justify-center md:flex lg:h-24 border-t border-white/10 bg-spotify-base-black px-4 text-sm text-spotify-gray">
        {inJam ? "The Jam's queue is empty. Play or add a song for everyone." : "Pick something to play"}
      </footer>
    );
  }

  const total = duration || current.duration || 0;
  const percent = total > 0 ? Math.min(100, (progress / total) * 100) : 0;

  return (
    <>
      {/* Mobile: compact mini-player sitting above the tab bar; tap it for the full-screen player. */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Open player"
        onClick={openSheet}
        onKeyDown={(e) => e.key === "Enter" && openSheet()}
        className="relative mx-2 mb-1 mt-1 flex flex-shrink-0 items-center gap-3 overflow-hidden rounded-md bg-spotify-highlight-black px-2 py-2 transition-transform active:scale-[0.98] md:hidden"
      >
        <img
          src={coverArtUrl(current.coverArt, 80)}
          alt=""
          className="h-10 w-10 flex-shrink-0 rounded object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{current.title}</p>
          <p className="truncate text-xs text-spotify-gray">{current.artist}</p>
        </div>
        {inJam && (
          <Link to="/jam" aria-label="Open Jam" onClick={(e) => e.stopPropagation()} className="flex h-10 w-10 flex-shrink-0 items-center justify-center text-spotify-green">
            <JamIcon className="h-5 w-5" />
          </Link>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void toggleStar();
          }}
          aria-label={isStarred ? "Remove from Liked Songs" : "Save to Liked Songs"}
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center ${isStarred ? "text-spotify-green" : "text-white"}`}
        >
          <HeartIcon filled={isStarred} className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
          disabled={!canTogglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center text-white disabled:opacity-40"
        >
          {isPlaying ? <PauseIcon className="h-6 w-6 fill-current" /> : <PlayIcon className="h-6 w-6 fill-current" />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            playNext();
          }}
          disabled={!canControl}
          aria-label="Next"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center text-white disabled:opacity-40"
        >
          <SkipNextIcon className="h-5 w-5 fill-current" />
        </button>
        <div className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white" style={{ width: `${percent}%` }} />
        </div>
      </div>

      {/* Desktop: three columns; the side columns shrink before the controls do. */}
      <footer className="hidden h-20 flex-shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-2 border-t border-white/10 bg-black px-3 md:grid lg:h-24 lg:gap-4 lg:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={coverArtUrl(current.coverArt, 80)}
            alt=""
            className="h-12 w-12 flex-shrink-0 rounded object-cover lg:h-14 lg:w-14"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium hover:underline">{current.title}</p>
            <p className="truncate text-xs text-spotify-gray">
              {current.artistId ? (
                <Link to={`/artist/${current.artistId}`} className="hover:underline">
                  {current.artist}
                </Link>
              ) : (
                current.artist
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleStar}
            aria-label={isStarred ? "Remove from Liked Songs" : "Save to Liked Songs"}
            className={`ml-2 flex-shrink-0 ${isStarred ? "text-spotify-green" : "text-spotify-gray hover:text-white"}`}
          >
            <HeartIcon filled={isStarred} className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2">
          <div className="flex items-center gap-4 lg:gap-5">
            <button
              type="button"
              onClick={toggleShuffle}
              aria-label="Shuffle"
              // A Jam plays its queue in order; keep the slot so controls don't shift.
              className={`${inJam ? "invisible" : ""} ${shuffle ? "text-spotify-green" : "text-spotify-gray hover:text-white"}`}
            >
              <ShuffleIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={playPrevious}
              disabled={!canControl}
              aria-label="Previous"
              className="text-spotify-gray hover:text-white disabled:opacity-40 disabled:hover:text-spotify-gray"
            >
              <SkipPrevIcon className="h-5 w-5 fill-current" />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              disabled={!canTogglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
            >
              {isPlaying ? <PauseIcon className="h-4 w-4 fill-current" /> : <PlayIcon className="h-4 w-4 fill-current pl-0.5" />}
            </button>
            <button
              type="button"
              onClick={playNext}
              disabled={!canControl}
              aria-label="Next"
              className="text-spotify-gray hover:text-white disabled:opacity-40 disabled:hover:text-spotify-gray"
            >
              <SkipNextIcon className="h-5 w-5 fill-current" />
            </button>
            <button
              type="button"
              onClick={cycleRepeat}
              aria-label="Repeat"
              className={`relative ${inJam ? "invisible" : ""} ${repeat !== "off" ? "text-spotify-green" : "text-spotify-gray hover:text-white"}`}
            >
              <RepeatIcon className="h-4 w-4" />
              {repeat === "one" && (
                <span className="absolute -right-1 -top-1 text-[8px] font-bold">1</span>
              )}
            </button>
          </div>
          <div className="flex w-full max-w-xl items-center gap-2 text-xs text-spotify-gray">
            <span className="hidden w-10 flex-shrink-0 text-right tabular-nums lg:block">{formatDuration(progress)}</span>
            <input
              type="range"
              className="spotify-slider"
              min={0}
              max={total}
              value={Math.min(progress, total)}
              disabled={!canControl}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <span className="hidden w-10 flex-shrink-0 tabular-nums lg:block">{formatDuration(total)}</span>
          </div>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 pr-1">
          <Link
            to="/jam"
            title={inJam ? "Open Jam" : "Start a Jam"}
            className={`mr-1 flex flex-shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${
              inJam ? "bg-spotify-green/15 text-spotify-green" : "text-spotify-gray hover:text-white"
            }`}
          >
            <JamIcon className="h-4 w-4" />
            {inJam && jam && <span className="hidden lg:inline">{jam.members.length}</span>}
          </Link>
          <VolumeIcon
            level={volume === 0 ? 0 : volume < 0.5 ? 1 : 2}
            className="h-4 w-4 flex-shrink-0 fill-spotify-gray"
          />
          <input
            type="range"
            className="spotify-slider w-full max-w-[8rem] min-w-[3rem]"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
          />
        </div>
      </footer>
    </>
  );
}
