import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { coverArtUrl, getPlaylist, getStarred2, setPlaylistSongs, streamUrl, unstar, type PlaylistWithSongs } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { isOwnPlaylist, refreshPlaylists } from "@/lib/playlists";
import { showToast } from "@/lib/songMenu";
import { shuffled } from "@/lib/shuffle";
import { setStarred } from "@/lib/trackStar";
import { Loading } from "@/components/Loading";
import { ChevronLeftIcon, CloseIcon, HeartIcon, VolumeIcon } from "@/components/icons";

// Sorting a playlist (or Liked Songs) like Tinder: one song at a time, in
// random order, with a bit of it playing. Swipe left and it goes, right and
// it stays. Nothing changes until the end, where the songs swiped left are
// removed (or unliked) in one go. Where you are is kept on this device, to
// carry on later.

/** Unliked this many at a time (the ids go in the URL). */
const UNSTAR_BATCH = 100;
/** How far (px) a card must be dragged to count. */
const SWIPE_DISTANCE = 110;
/** The preview starts this far into the song (the verse or chorus, not the intro). */
const PREVIEW_AT = 0.3;
const MUTED_KEY = "spotifion.swipeMuted";

type Decision = "keep" | "remove";

interface Progress {
  /** The songs when sorting started, to check they haven't changed since. */
  ids: string[];
  /** The order the songs come in: their positions in the playlist, shuffled. */
  order: number[];
  /** One per song sorted so far, in `order`. */
  decisions: Decision[];
}

const NO_SONGS: Child[] = [];

const progressKey = (id: string) => `spotifion.swipe.${id}`;

/** Where you left off (the same random order), or a new random order. */
function loadProgress(id: string, ids: string[]): Pick<Progress, "order" | "decisions"> {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(id)) ?? "null") as Progress | null;
    // Only if it's still the same playlist (songs added or removed meanwhile: start over).
    if (saved && saved.ids.join(",") === ids.join(",") && saved.order?.length === ids.length) {
      return { order: saved.order, decisions: saved.decisions };
    }
  } catch {
    // Nothing saved.
  }
  return { order: shuffled(ids.map((_, i) => i)), decisions: [] };
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

/** What's being sorted, and what swiping left does to it. */
interface SwipeTarget {
  /** Where the progress is kept on this device. */
  key: string;
  name: string;
  /** The page to go back to. */
  back: string;
  songs: Child[];
  /** "Remove" (from a playlist) or "Unlike". */
  verb: string;
  /** Does it to the songs at these positions; resolves to what to tell. */
  apply: (positions: number[]) => Promise<string>;
}

/** /playlist/:id/swipe */
export function PlaylistSwipe() {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<PlaylistWithSongs | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getPlaylist(id)
      .then((p) => !cancelled && setPlaylist(p))
      .catch(() => !cancelled && setPlaylist(null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const target = useMemo<SwipeTarget | null>(() => {
    if (!playlist) return null;
    const songs = playlist.entry ?? NO_SONGS;
    return {
      key: playlist.id,
      name: playlist.name,
      back: `/playlist/${playlist.id}`,
      songs,
      verb: "Remove",
      async apply(positions) {
        // From the playlist as it is now: by position if it hasn't changed, else by song.
        const fresh = (await getPlaylist(playlist.id)).entry ?? [];
        let kept: Child[];
        if (fresh.map((s) => s.id).join(",") === songs.map((s) => s.id).join(",")) {
          const gone = new Set(positions);
          kept = fresh.filter((_, i) => !gone.has(i));
        } else {
          kept = [...fresh];
          for (const i of positions) {
            const at = kept.findIndex((s) => s.id === songs[i].id);
            if (at !== -1) kept.splice(at, 1);
          }
        }
        await setPlaylistSongs(playlist.id, kept.map((s) => s.id));
        refreshPlaylists();
        return `Removed ${positions.length} song${positions.length === 1 ? "" : "s"} from ${playlist.name}`;
      },
    };
  }, [playlist]);

  if (playlist === undefined) return <Loading />;
  if (playlist === null || !target) return <p className="pt-10 text-center text-spotify-gray">This playlist doesn't exist any more.</p>;
  if (!isOwnPlaylist(playlist)) {
    return <p className="pt-10 text-center text-spotify-gray">Only the playlist's owner can sort it.</p>;
  }
  return <SwipeSort key={target.key} target={target} />;
}

/** /liked/swipe: swiping left unlikes. */
export function LikedSwipe() {
  const [songs, setSongs] = useState<Child[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStarred2()
      .then((r) => !cancelled && setSongs(r.song ?? []))
      .catch(() => !cancelled && setSongs([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const target = useMemo<SwipeTarget | null>(
    () =>
      songs && {
        key: "liked",
        name: "Liked Songs",
        back: "/liked",
        songs,
        verb: "Unlike",
        async apply(positions) {
          const ids = positions.map((i) => songs[i].id);
          for (let i = 0; i < ids.length; i += UNSTAR_BATCH) {
            const batch = ids.slice(i, i + UNSTAR_BATCH);
            await unstar({ id: batch });
            for (const id of batch) setStarred(id, false);
          }
          return `Unliked ${ids.length} song${ids.length === 1 ? "" : "s"}`;
        },
      },
    [songs],
  );

  if (!target) return <Loading />;
  if (!target.songs.length) return <p className="pt-10 text-center text-spotify-gray">No liked songs to sort.</p>;
  return <SwipeSort key={target.key} target={target} />;
}

function SwipeSort({ target }: { target: SwipeTarget }) {
  const { key, songs } = target;
  const [{ order, decisions }, setProgress] = useState(() => loadProgress(key, songs.map((s) => s.id)));
  const [finishing, setFinishing] = useState(false);
  const ids = useMemo(() => songs.map((s) => s.id), [songs]);

  const decide = useCallback(
    (decision: Decision) => {
      setProgress((prev) => {
        if (prev.decisions.length >= songs.length) return prev;
        const next = { order: prev.order, decisions: [...prev.decisions, decision] };
        saveProgress(key, { ids, ...next });
        return next;
      });
    },
    [key, ids, songs.length],
  );

  const undo = useCallback(() => {
    setFinishing(false);
    setProgress((prev) => {
      const next = { order: prev.order, decisions: prev.decisions.slice(0, -1) };
      saveProgress(key, { ids, ...next });
      return next;
    });
  }, [key, ids]);

  const done = decisions.length >= songs.length;
  return done || finishing ? (
    <Summary target={target} order={order} decisions={decisions} onUndo={undo} onBack={() => setFinishing(false)} done={done} />
  ) : (
    <Deck target={target} order={order} index={decisions.length} decisions={decisions} onDecide={decide} onUndo={undo} onFinish={() => setFinishing(true)} />
  );
}

function Deck({
  target,
  order,
  index,
  decisions,
  onDecide,
  onUndo,
  onFinish,
}: {
  target: SwipeTarget;
  order: number[];
  index: number;
  decisions: Decision[];
  onDecide: (d: Decision) => void;
  onUndo: () => void;
  onFinish: () => void;
}) {
  const { songs, verb } = target;
  const song = songs[order[index]];
  const upcoming = songs[order[index + 1]];
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
        <Link to={target.back} aria-label={`Back to ${target.name}`} className="text-spotify-gray hover:text-white">
          <ChevronLeftIcon className="h-6 w-6" />
        </Link>
        <div className="min-w-0 text-center">
          <p className="truncate font-bold">{target.name}</p>
          <p className="text-xs text-spotify-gray">
            {index + 1} of {songs.length} · {removed} to {verb.toLowerCase()}
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
        {/* Keyed by position: a new card and picture for each song (reusing them kept the old cover on screen). */}
        {upcoming && <Card key={`next-${index + 1}`} song={upcoming} className="scale-95 opacity-60" />}
        <div
          key={`top-${index}`}
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
            {verb}
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
          aria-label={verb}
          title={`${verb} (←)`}
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500 text-red-500 transition hover:scale-105 hover:bg-red-500/10"
        >
          <CloseIcon className="h-7 w-7" />
        </button>
        <button
          type="button"
          onClick={() => commit("keep")}
          aria-label="Keep"
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
      <p className="mt-4 hidden text-center text-xs text-spotify-gray md:block">← {verb.toLowerCase()} · → keep · Backspace to undo</p>
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

/** What's left to do: remove (or unlike) the songs swiped left, in one go. */
function Summary({
  target,
  order,
  decisions,
  done,
  onUndo,
  onBack,
}: {
  target: SwipeTarget;
  order: number[];
  decisions: Decision[];
  done: boolean;
  onUndo: () => void;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const { songs, verb } = target;
  // Their positions, in the list's order.
  const removing = decisions.flatMap((d, k) => (d === "remove" ? [order[k]] : [])).sort((a, b) => a - b);
  const left = songs.length - decisions.length;

  async function apply() {
    setSaving(true);
    try {
      const message = await target.apply(removing);
      saveProgress(target.key, null);
      showToast(message);
      navigate(target.back);
    } catch {
      showToast("Couldn't save that. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 pt-6 text-center md:pt-10">
      <h1 className="text-2xl font-bold">{done ? "All sorted" : "Finish sorting?"}</h1>
      <p className="text-spotify-gray">
        {decisions.length - removing.length} kept · <span className="text-white">
          {removing.length} to {verb.toLowerCase()}
        </span>
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
            {saving ? "Saving…" : `${verb} ${removing.length} song${removing.length === 1 ? "" : "s"}`}
          </button>
        ) : (
          <Link to={target.back} className="rounded-full bg-white px-6 py-3 font-bold text-black">
            Nothing to {verb.toLowerCase()}: back to {target.name}
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
