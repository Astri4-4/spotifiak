import { usePlayer } from "@/context/PlayerContext";
import { PLAYBACK_RATES, SKIP_BACK, SKIP_FORWARD } from "@/lib/podcasts";
import { SkipBackSecondsIcon, SkipForwardSecondsIcon } from "./icons";

// The extra controls the player shows for podcast episodes, in place of
// shuffle and repeat (skips) and lyrics (speed).

export function SkipBackButton({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  const { progress, seek, canControl } = usePlayer();
  return (
    <button
      type="button"
      onClick={() => seek(Math.max(0, progress - SKIP_BACK))}
      disabled={!canControl}
      aria-label={`Back ${SKIP_BACK} seconds`}
      title={`Back ${SKIP_BACK} seconds`}
      className={`disabled:opacity-40 ${className ?? ""}`}
    >
      <SkipBackSecondsIcon seconds={SKIP_BACK} className={iconClassName} />
    </button>
  );
}

export function SkipForwardButton({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  const { progress, duration, current, seek, canControl } = usePlayer();
  const total = duration || current?.duration || Infinity;
  return (
    <button
      type="button"
      onClick={() => seek(Math.min(total, progress + SKIP_FORWARD))}
      disabled={!canControl}
      aria-label={`Forward ${SKIP_FORWARD} seconds`}
      title={`Forward ${SKIP_FORWARD} seconds`}
      className={`disabled:opacity-40 ${className ?? ""}`}
    >
      <SkipForwardSecondsIcon seconds={SKIP_FORWARD} className={iconClassName} />
    </button>
  );
}

/** Cycles the speed; hidden where it can't apply (a Jam, or another device playing). */
export function SpeedButton({ className, hidden }: { className?: string; hidden?: boolean }) {
  const { playbackRate, setPlaybackRate } = usePlayer();
  if (hidden) return null;
  const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(playbackRate) + 1) % PLAYBACK_RATES.length];
  return (
    <button
      type="button"
      onClick={() => setPlaybackRate(next)}
      aria-label={`Speed ${playbackRate}×, change to ${next}×`}
      title="Playback speed"
      className={`flex-shrink-0 rounded-full text-xs font-bold tabular-nums ${playbackRate !== 1 ? "text-spotify-green" : ""} ${className ?? ""}`}
    >
      {playbackRate}×
    </button>
  );
}
