import { useState } from "react";
import { Link } from "react-router-dom";
import { usePlayer } from "@/context/PlayerContext";
import { coverArtUrl, star, unstar } from "@/api/subsonic";
import { formatDuration } from "@/lib/format";
import {
  HeartIcon,
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
  } = usePlayer();

  const [starred, setStarred] = useState(false);

  if (!current) {
    return (
      <footer className="flex h-24 flex-shrink-0 items-center justify-center border-t border-white/10 bg-spotify-base-black px-4 text-sm text-spotify-gray">
        Pick something to play
      </footer>
    );
  }

  const isStarred = starred || Boolean(current.starred);

  async function toggleStar() {
    if (!current) return;
    try {
      if (isStarred) {
        await unstar({ id: [current.id] });
        setStarred(false);
      } else {
        await star({ id: [current.id] });
        setStarred(true);
      }
    } catch {
      // ignore - non-critical UI affordance
    }
  }

  return (
    <footer className="grid h-24 flex-shrink-0 grid-cols-3 items-center gap-4 border-t border-white/10 bg-spotify-base-black px-4">
      <div className="flex min-w-0 items-center gap-3">
        <img
          src={coverArtUrl(current.coverArt, 80)}
          alt=""
          className="h-14 w-14 flex-shrink-0 rounded object-cover"
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

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={toggleShuffle}
            aria-label="Shuffle"
            className={shuffle ? "text-spotify-green" : "text-spotify-gray hover:text-white"}
          >
            <ShuffleIcon className="h-4 w-4" />
          </button>
          <button type="button" onClick={playPrevious} aria-label="Previous" className="text-spotify-gray hover:text-white">
            <SkipPrevIcon className="h-5 w-5 fill-current" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black hover:scale-105"
          >
            {isPlaying ? <PauseIcon className="h-4 w-4 fill-current" /> : <PlayIcon className="h-4 w-4 fill-current pl-0.5" />}
          </button>
          <button type="button" onClick={playNext} aria-label="Next" className="text-spotify-gray hover:text-white">
            <SkipNextIcon className="h-5 w-5 fill-current" />
          </button>
          <button
            type="button"
            onClick={cycleRepeat}
            aria-label="Repeat"
            className={`relative ${repeat !== "off" ? "text-spotify-green" : "text-spotify-gray hover:text-white"}`}
          >
            <RepeatIcon className="h-4 w-4" />
            {repeat === "one" && (
              <span className="absolute -right-1 -top-1 text-[8px] font-bold">1</span>
            )}
          </button>
        </div>
        <div className="flex w-full max-w-xl items-center gap-2 text-xs text-spotify-gray">
          <span className="w-10 text-right tabular-nums">{formatDuration(progress)}</span>
          <input
            type="range"
            className="spotify-slider"
            min={0}
            max={duration || current.duration || 0}
            value={Math.min(progress, duration || current.duration || 0)}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <span className="w-10 tabular-nums">{formatDuration(duration || current.duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <VolumeIcon
          level={volume === 0 ? 0 : volume < 0.5 ? 1 : 2}
          className="h-4 w-4 flex-shrink-0 fill-spotify-gray"
        />
        <input
          type="range"
          className="spotify-slider w-24"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>
    </footer>
  );
}
