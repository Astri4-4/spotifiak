import { useState } from "react";
import { Link } from "react-router-dom";
import type { PodcastEpisode } from "@/api/podcasts";
import { usePlayer } from "@/context/PlayerContext";
import { episodeToTrack, formatEpisodeStatus, formatPublished, usePodcasts } from "@/lib/podcasts";
import { openSongMenu } from "@/lib/songMenu";
import { CheckIcon, MoreIcon, PauseIcon, PlayIcon } from "./icons";

/** One episode in a list: play it, see how far you got, read its notes. */
export function EpisodeRow({ episode, showName = false }: { episode: PodcastEpisode; showName?: boolean }) {
  const { current, isPlaying, playQueue, togglePlay } = usePlayer();
  const { progress } = usePodcasts();
  const [expanded, setExpanded] = useState(false);
  const saved = progress[episode.id];
  const isCurrent = current?.id === episode.id;
  const total = episode.duration || saved?.d || 0;
  const started = saved && !saved.done && saved.p > 0 && total > 0;

  function play() {
    // Already loaded: carry on rather than start over.
    if (isCurrent) togglePlay();
    else playQueue([episodeToTrack(episode)]);
  }

  function openMenu(x: number, y: number) {
    openSongMenu({ track: episodeToTrack(episode), x, y });
  }

  const status = formatEpisodeStatus(episode, saved);
  const published = formatPublished(episode.published);

  return (
    <article
      className="flex gap-3 border-b border-white/10 py-4 last:border-b-0 sm:gap-4"
      onContextMenu={(e) => {
        e.preventDefault();
        openMenu(e.clientX, e.clientY);
      }}
    >
      <img src={episode.image || "/placeholder-cover.svg"} alt="" loading="lazy" className="h-16 w-16 flex-shrink-0 rounded object-cover sm:h-24 sm:w-24" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {showName && (
          <Link to={`/podcast/${episode.podcastId}`} className="truncate text-xs font-semibold text-spotify-gray hover:text-white hover:underline">
            {episode.show}
          </Link>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`text-left font-semibold leading-snug hover:underline ${isCurrent ? "text-spotify-green" : "text-white"} ${expanded ? "" : "line-clamp-2"}`}
        >
          {episode.title}
        </button>
        {episode.description && (
          <p className={`whitespace-pre-line text-sm text-spotify-gray ${expanded ? "" : "line-clamp-2"}`}>{episode.description}</p>
        )}
        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={play}
            aria-label={isCurrent && isPlaying ? `Pause ${episode.title}` : `Play ${episode.title}`}
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:scale-105"
          >
            {isCurrent && isPlaying ? <PauseIcon className="h-4 w-4 fill-current" /> : <PlayIcon className="h-4 w-4 fill-current pl-0.5" />}
          </button>
          <span className="flex min-w-0 items-center gap-2 text-xs text-spotify-gray">
            {saved?.done && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0 text-spotify-green" />}
            <span className="truncate">{[published, status].filter(Boolean).join(" · ")}</span>
          </span>
          {started && (
            <span className="hidden h-1 w-24 flex-shrink-0 overflow-hidden rounded-full bg-white/20 sm:block">
              <span className="block h-full rounded-full bg-white" style={{ width: `${Math.min(100, (saved.p / total) * 100)}%` }} />
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              openMenu(rect.left, rect.bottom);
            }}
            aria-label="More options"
            className="ml-auto flex h-8 w-8 flex-shrink-0 items-center justify-center text-spotify-gray hover:text-white"
          >
            <MoreIcon className="h-5 w-5 fill-current" />
          </button>
        </div>
      </div>
    </article>
  );
}
