import { useEffect, useRef, useState } from "react";
import {
  discoverSearch,
  isDownloadDone,
  type DiscoverAlbum,
  type DiscoverDownload,
  type DiscoverTrack,
  type DiscoverType,
} from "@/api/discover";
import { useConnect, usePlayer } from "@/context/PlayerContext";
import { download, findDownload, useDownloads } from "@/lib/discover";
import { formatDuration } from "@/lib/format";
import { Loading } from "./Loading";
import { CardGrid } from "./CardGrid";
import { CheckIcon, DownloadIcon, PauseIcon, PlayIcon } from "./icons";

interface Results {
  tracks: DiscoverTrack[];
  albums: DiscoverAlbum[];
}

/** Search results from Deezer, through deemix, to preview and download into the library. */
export function DiscoverResults({ query }: { query: string }) {
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const downloads = useDownloads();
  const preview = usePreview();

  useEffect(() => {
    let cancelled = false;
    setResults(null);
    setError(null);
    Promise.all([discoverSearch(query, "track"), discoverSearch(query, "album")])
      .then(([tracks, albums]) => !cancelled && setResults({ tracks, albums }))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Search failed."));
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (error) return <p className="pt-16 text-center text-spotify-gray">{error}</p>;
  if (!results) return <Loading label={`Searching Deezer for "${query}"...`} />;
  if (results.tracks.length === 0 && results.albums.length === 0) {
    return <p className="pt-16 text-center text-spotify-gray">Nothing found on Deezer for &ldquo;{query}&rdquo;.</p>;
  }

  return (
    <div>
      {results.tracks.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-xl font-bold">Songs</h2>
          <div className="flex flex-col">
            {results.tracks.map((track) => (
              <div key={track.id} className="group flex items-center gap-3 rounded-md p-2 hover:bg-white/10">
                <button
                  type="button"
                  onClick={() => preview.toggle(track)}
                  disabled={!track.preview}
                  aria-label={preview.playingId === track.id ? `Stop the preview of ${track.title}` : `Preview ${track.title}`}
                  title="30-second preview"
                  className="relative h-12 w-12 flex-shrink-0 disabled:cursor-default"
                >
                  <img src={track.cover} alt="" className="h-full w-full rounded object-cover" />
                  {track.preview && (
                    <span
                      className={`absolute inset-0 items-center justify-center rounded bg-black/50 ${
                        preview.playingId === track.id ? "flex" : "hidden group-hover:flex [@media(hover:none)]:flex"
                      }`}
                    >
                      {preview.playingId === track.id ? (
                        <PauseIcon className="h-5 w-5 fill-pure-white" />
                      ) : (
                        <PlayIcon className="h-5 w-5 fill-pure-white" />
                      )}
                    </span>
                  )}
                </button>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium ${preview.playingId === track.id ? "text-spotify-green" : ""}`}>
                    {track.title}
                  </span>
                  <span className="block truncate text-sm text-spotify-gray">
                    {track.artist}
                    <span className="hidden lg:inline"> · {track.album}</span>
                  </span>
                </span>
                <span className="hidden flex-shrink-0 text-sm tabular-nums text-spotify-gray sm:block">
                  {formatDuration(track.duration)}
                </span>
                <DownloadButton type="track" id={track.id} title={track.title} downloads={downloads} />
              </div>
            ))}
          </div>
        </section>
      )}

      {results.albums.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-bold">Albums</h2>
          <CardGrid>
            {results.albums.map((album) => (
              <div key={album.id} className="flex min-w-0 flex-col gap-3 rounded-md bg-spotify-elevated-black/60 p-3 sm:p-4">
                <img src={album.cover} alt="" loading="lazy" className="aspect-square w-full rounded object-cover shadow-lg" />
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold" title={album.title}>
                      {album.title}
                    </span>
                    <span className="block truncate text-sm text-spotify-gray">
                      {album.artist} · {album.trackCount} songs
                    </span>
                  </span>
                  <DownloadButton type="album" id={album.id} title={album.title} downloads={downloads} />
                </div>
              </div>
            ))}
          </CardGrid>
        </section>
      )}
    </div>
  );
}

function DownloadButton({
  type,
  id,
  title,
  downloads,
}: {
  type: DiscoverType;
  id: string;
  title: string;
  downloads: DiscoverDownload[];
}) {
  const [starting, setStarting] = useState(false);
  const current = findDownload(downloads, type, id);
  const pending = starting || (current && !isDownloadDone(current));
  const done = current?.status === "completed" || current?.status === "gone";
  const partly = current?.status === "withErrors";

  async function start() {
    setStarting(true);
    await download(type, id, title);
    setStarting(false);
  }

  if (pending) {
    const percent = current?.status === "downloading" ? Math.round(current.progress) : null;
    return (
      <span
        className="flex h-9 flex-shrink-0 items-center gap-2 px-1 text-xs font-semibold text-spotify-green"
        title={percent === null ? "Waiting to download" : `Downloading: ${percent}%`}
      >
        <ProgressRing percent={percent ?? 0} spinning={percent === null} />
        <span className="hidden w-9 tabular-nums sm:inline">{percent === null ? "" : `${percent}%`}</span>
      </span>
    );
  }
  if (done) {
    return (
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center text-spotify-green" title="In your library">
        <CheckIcon className="h-5 w-5" />
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void start()}
      aria-label={`Download ${title}`}
      title={partly ? "Some songs failed: try again" : current?.status === "failed" ? "Failed: try again" : "Download to your library"}
      className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full hover:scale-105 hover:text-white ${
        partly || current?.status === "failed" ? "text-yellow-500" : "text-spotify-gray"
      }`}
    >
      <DownloadIcon className="h-6 w-6" />
    </button>
  );
}

function ProgressRing({ percent, spinning }: { percent: number; spinning: boolean }) {
  const circumference = 2 * Math.PI * 9;
  return (
    <svg viewBox="0 0 24 24" className={`h-6 w-6 -rotate-90 ${spinning ? "animate-spin" : ""}`} aria-hidden>
      <circle cx={12} cy={12} r={9} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5} />
      <circle
        cx={12}
        cy={12}
        r={9}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={spinning ? circumference * 0.75 : circumference * (1 - percent / 100)}
      />
    </svg>
  );
}

/**
 * Deezer's 30-second previews, on their own audio element. Starting one
 * pauses the player here; one playing on another device carries on.
 */
function usePreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { isPlaying, togglePlay, inJam } = usePlayer();
  const { remoteDevice } = useConnect();

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const stop = () => setPlayingId(null);
    audio.addEventListener("ended", stop);
    audio.addEventListener("error", stop);
    return () => {
      audio.pause();
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("error", stop);
    };
  }, []);

  // The player starting again (e.g. from the play button) stops the preview.
  useEffect(() => {
    if (isPlaying && !remoteDevice) {
      audioRef.current?.pause();
      setPlayingId(null);
    }
  }, [isPlaying, remoteDevice]);

  function toggle(track: DiscoverTrack) {
    const audio = audioRef.current;
    if (!audio || !track.preview) return;
    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    if (isPlaying && !remoteDevice && !inJam) togglePlay();
    audio.src = track.preview;
    audio.play().then(
      () => setPlayingId(track.id),
      () => setPlayingId(null),
    );
  }

  return { playingId, toggle };
}
