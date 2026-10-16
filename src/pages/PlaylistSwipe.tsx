import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { coverArtUrl, getPlaylist, setPlaylistSongs, streamUrl, type PlaylistWithSongs } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { isOwnPlaylist, refreshPlaylists } from "@/lib/playlists";
import { showToast } from "@/lib/songMenu";
import { Loading } from "@/components/Loading";
import { ChevronLeftIcon, CloseIcon, HeartIcon, VolumeIcon } from "@/components/icons";

// Sorting a playlist like Tinder: one song at a time, with a bit of it
// playing. Swipe left and it goes, right and it stays. Nothing changes until
// the end, where the songs swiped left are removed in one go. Where you are
// is kept on this device, to carry on later.

/** How far (px) a card must be dragged to count. */
const SWIPE_DISTANCE = 110;
/** The preview starts this far into the song (the verse or chorus, not the intro). */
const PREVIEW_AT = 0.3;
const MUTED_KEY = "spotifion.swipeMuted";

type Decision = "keep" | "remove";

interface Progress {
  /** The playlist's songs when sorting started, to check it hasn't changed since. */
  ids: string[];
  decisions: Decision[];
}

const NO_SONGS: Child[] = [];

const progressKey = (id: string) => `spotifion.swipe.${id}`;

function loadProgress(id: string, ids: string[]): Decision[] {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(id)) ?? "null") as Progress | null;
    // Only if it's still the same playlist (songs added or removed meanwhile: start over).
    if (saved && saved.ids.join(",") === ids.join(",")) return saved.decisions;
  } catch {
    // Nothing saved.
  }
  return [];
}

function saveProgress(id: string, progress: Progress | null) {
  try {
    if (progress && progress.decisions.length) localStorage.setItem(progressKey(id), JSON.stringify(progress));
    else localStorage.removeItem(progressKey(id));
  } catch {
    // Not kept: it starts over next time.
  }
}

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === "true";
  } catch {
    return false;
  }
}

/** /playlist/:id/swipe */
export function PlaylistSwipe() {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<PlaylistWithSongs | null | undefined>(undefined);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPlaylist(id)
      .then((p) => {
        if (cancelled) return;
        setPlaylist(p);
        setDecisions(loadProgress(id, (p.entry ?? []).map((s) => s.id)));
      })
      .catch(() => !cancelled && setPlaylist(null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const songs = playlist?.entry ?? NO_SONGS;
  const decide = useCallback(
    (decision: Decision) => {
      if (!id || !playlist) return;
      setDecisions((prev) => {
        if (prev.length >= songs.length) return prev;
        const next = [...prev, decision];
        saveProgress(id, { ids: songs.map((s) => s.id), decisions: next });
        return next;
      });
    },
    [id, playlist, songs],
  );

  const undo = useCallback(() => {
    if (!id) return;
    setFinishing(false);
    setDecisions((prev) => {
      const next = prev.slice(0, -1);
      saveProgress(id, { ids: songs.map((s) => s.id), decisions: next });
      return next;
    });
  }, [id, songs]);

  if (playlist === undefined) return <Loading />;
  if (playlist === null || !id) return <p className="pt-10 text-center text-spotify-gray">This playlist doesn't exist any more.</p>;
  if (!isOwnPlaylist(playlist)) {
    return <p className="pt-10 text-center text-spotify-gray">Only the playlist's owner can sort it.</p>;
  }

  const done = decisions.length >= songs.length;
  return done || finishing ? (
    <Summary playlist={playlist} decisions={decisions} onUndo={undo} onBack={() => setFinishing(false)} done={done} />
  ) : (
    <Deck playlist={playlist} index={decisions.length} decisions={decisions} onDecide={decide} onUndo={undo} onFinish={() => setFinishing(true)} />
  );
}

function Deck({
  playlist,
  index,
  decisions,
  onDecide,
  onUndo,
  onFinish,
}: {
  playlist: PlaylistWithSongs;
  index: number;
  decisions: Decision[];
  onDecide: (d: Decision) => void;
  onUndo: () => void;
  onFinish: () => void;
}) {
  const songs = playlist.entry ?? [];
  const song = songs[index];
  const upcoming = songs[index + 1];
  const removed = decisions.filter((d) => d === "remove").length;
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState<Decision | null>(null);
  const start = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const [muted, setMuted] = useState(loadMuted);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { isPlaying, togglePlay } = usePlayer();

  // The previews would play over the music: pause it while sorting.
  useEffect(() => {
    if (isPlaying) togglePlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A bit of each song, from a third of the way in.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !song) return;
    audio.src = streamUrl(song.id);
    audio.currentTime = (song.duration ?? 0) * PREVIEW_AT;
    if (!muted) void audio.play().catch(() => void 0);
    return () => audio.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
    try {
      localStorage.setItem(MUTED_KEY, String(muted));
    } catch {
      // Not kept.
    }
    if (!muted && audio.paused && audio.src) void audio.play().catch(() => void 0);
  }, [muted]);

  const commit = useCallback(
    (decision: Decision) => {
      if (leaving) return;
      setLeaving(decision);
      // Let the card fly off before the next one shows.
      window.setTimeout(() => {
        setLeaving(null);
        setDrag(null);
        onDecide(decision);
      }, 220);
    },
    [leaving, onDecide],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") commit("remove");
      else if (e.key === "ArrowRight") commit("keep");
      else if (e.key === "Backspace" || (e.key === "z" && (e.metaKey || e.ctrlKey))) onUndo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commit, onUndo]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (leaving) return;
    start.current = { x: e.clientX, y: e.clientY, pointer: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0 });
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.pointer !== e.pointerId) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  }

  function onPointerUp() {
    if (!start.current) return;
    start.current = null;
    const x = drag?.x ?? 0;
    if (x > SWIPE_DISTANCE) commit("keep");
    else if (x < -SWIPE_DISTANCE) commit("remove");
    else setDrag(null);
  }

  if (!song) return null;
  const x = leaving ? (leaving === "keep" ? 1 : -1) * window.innerWidth : (drag?.x ?? 0);
  const y = leaving ? (drag?.y ?? 0) : (drag?.y ?? 0) * 0.3;
  const leaning = Math.max(-1, Math.min(1, x / SWIPE_DISTANCE));

  return (
    <div className="mx-auto flex max-w-md flex-col pt-4 md:pt-6">
      <audio ref={audioRef} preload="auto" />
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to={`/playlist/${playlist.id}`} aria-label="Back to the playlist" className="text-spotify-gray hover:text-white">
          <ChevronLeftIcon className="h-6 w-6" />
        </Link>
        <div className="min-w-0 text-center">
          <p className="truncate font-bold">{playlist.name}</p>
          <p className="text-xs text-spotify-gray">
            {index + 1} of {songs.length} · {removed} to remove
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? "Play previews" : "Mute previews"}
          title={muted ? "Play previews" : "Mute previews"}
          className={`relative flex h-8 w-8 items-center justify-center rounded-full ${muted ? "text-spotify-gray" : "text-white"} hover:bg-white/10`}
        >
          <VolumeIcon className="h-5 w-5" />
          {muted && <span className="absolute h-0.5 w-6 rotate-45 rounded bg-current" aria-hidden />}
        </button>
      </div>

      <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full bg-spotify-green transition-all" style={{ width: `${(index / songs.length) * 100}%` }} />
      </div>

      <div className="relative aspect-[3/4] w-full select-none">
        {upcoming && <Card song={upcoming} className="scale-95 opacity-60" />}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`absolute inset-0 touch-none cursor-grab active:cursor-grabbing ${drag && !leaving ? "" : "transition-transform duration-200 ease-out"}`}
          style={{ transform: `translate(${x}px, ${y}px) rotate(${x / 18}deg)` }}
        >
          <Card song={song} />
          <span
            className="absolute left-5 top-6 -rotate-12 rounded-lg border-4 border-spotify-green px-3 py-1 text-2xl font-black uppercase text-spotify-green"
            style={{ opacity: Math.max(0, leaning) }}
          >
            Keep
          </span>
          <span
            className="absolute right-5 top-6 rotate-12 rounded-lg border-4 border-red-500 px-3 py-1 text-2xl font-black uppercase text-red-500"
            style={{ opacity: Math.max(0, -leaning) }}
          >
            Remove
          </span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={onUndo}
          disabled={index === 0}
          className="rounded-full px-3 py-2 text-sm font-semibold text-spotify-gray hover:text-white disabled:opacity-30"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => commit("remove")}
          aria-label="Remove from the playlist"
          title="Remove (←)"
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500 text-red-500 transition hover:scale-105 hover:bg-red-500/10"
        >
          <CloseIcon className="h-7 w-7" />
        </button>
        <button
          type="button"
          onClick={() => commit("keep")}
          aria-label="Keep in the playlist"
          title="Keep (→)"
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-spotify-green text-spotify-green transition hover:scale-105 hover:bg-spotify-green/10"
        >
          <HeartIcon filled className="h-7 w-7" />
        </button>
        <button
          type="button"
          onClick={onFinish}
          disabled={index === 0}
          className="rounded-full px-3 py-2 text-sm font-semibold text-spotify-gray hover:text-white disabled:opacity-30"
        >
          Finish
        </button>
      </div>
      <p className="mt-4 hidden text-center text-xs text-spotify-gray md:block">← remove · → keep · Backspace to undo</p>
    </div>
  );
}

function Card({ song, className = "" }: { song: Child; className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden rounded-2xl bg-spotify-highlight-black shadow-2xl ${className}`}>
      <img src={coverArtUrl(song.coverArt, 600)} alt="" draggable={false} className="h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-5 pt-20">
        <p className="line-clamp-2 text-2xl font-bold leading-tight">{song.title}</p>
        <p className="mt-1 truncate text-spotify-gray">{song.artist}</p>
        {song.album && <p className="truncate text-sm text-spotify-gray">{song.album}</p>}
      </div>
    </div>
  );
}

/** What's left to do: remove the songs swiped left, in one go. */
function Summary({
  playlist,
  decisions,
  done,
  onUndo,
  onBack,
}: {
  playlist: PlaylistWithSongs;
  decisions: Decision[];
  done: boolean;
  onUndo: () => void;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const songs = playlist.entry ?? [];
  const removing = decisions.flatMap((d, i) => (d === "remove" ? [i] : []));
  const left = songs.length - decisions.length;

  async function apply() {
    setSaving(true);
    try {
      // From the playlist as it is now: by position if it hasn't changed, else by song.
      const fresh = (await getPlaylist(playlist.id)).entry ?? [];
      let kept: Child[];
      if (fresh.map((s) => s.id).join(",") === songs.map((s) => s.id).join(",")) {
        const gone = new Set(removing);
        kept = fresh.filter((_, i) => !gone.has(i));
      } else {
        const toRemove = removing.map((i) => songs[i].id);
        kept = [...fresh];
        for (const songId of toRemove) {
          const at = kept.findIndex((s) => s.id === songId);
          if (at !== -1) kept.splice(at, 1);
        }
      }
      await setPlaylistSongs(playlist.id, kept.map((s) => s.id));
      saveProgress(playlist.id, null);
      refreshPlaylists();
      showToast(`Removed ${removing.length} song${removing.length === 1 ? "" : "s"} from ${playlist.name}`);
      navigate(`/playlist/${playlist.id}`);
    } catch {
      showToast("Couldn't save the playlist. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 pt-6 text-center md:pt-10">
      <h1 className="text-2xl font-bold">{done ? "All sorted" : "Finish sorting?"}</h1>
      <p className="text-spotify-gray">
        {decisions.length - removing.length} kept · <span className="text-white">{removing.length} to remove</span>
        {!done && ` · ${left} not sorted yet (they stay)`}
      </p>

      {removing.length > 0 && (
        <ul className="max-h-[45vh] overflow-y-auto rounded-lg bg-white/5 p-2 text-left">
          {removing.map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-md p-1.5">
              <img src={coverArtUrl(songs[i].coverArt, 80)} alt="" className="h-10 w-10 flex-shrink-0 rounded object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{songs[i].title}</span>
                <span className="block truncate text-xs text-spotify-gray">{songs[i].artist}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        {removing.length > 0 ? (
          <button
            type="button"
            onClick={() => void apply()}
            disabled={saving}
            className="rounded-full bg-red-500 px-6 py-3 font-bold text-pure-white transition hover:scale-[1.02] disabled:opacity-50"
          >
            {saving ? "Saving…" : `Remove ${removing.length} song${removing.length === 1 ? "" : "s"}`}
          </button>
        ) : (
          <Link to={`/playlist/${playlist.id}`} className="rounded-full bg-white px-6 py-3 font-bold text-black">
            Nothing to remove: back to the playlist
          </Link>
        )}
        {done ? (
          <button type="button" onClick={onUndo} className="py-2 text-sm font-semibold text-spotify-gray hover:text-white">
            Undo the last one
          </button>
        ) : (
          <button type="button" onClick={onBack} className="py-2 text-sm font-semibold text-spotify-gray hover:text-white">
            Keep sorting
          </button>
        )}
      </div>
    </div>
  );
}
