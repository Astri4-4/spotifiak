import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ActionHandler, MediaSessionAction } from "@capgo/capacitor-media-session";
import { MediaSession } from "@/lib/mediaSession";
import { coverArtUrl, scrobble, streamUrl } from "@/api/subsonic";
import { reportPlay } from "@/api/scoreboard";
import { reportStream } from "@/api/streams";
import { toJamTrack } from "@/api/jam";
import { getShareListening } from "@/lib/sharing";
import { getEpisodeProgress, isEpisode, PLAYBACK_RATES, recordProgress, SKIP_BACK, SKIP_FORWARD } from "@/lib/podcasts";
import type { Child } from "@/types/subsonic";
import { useJam } from "./JamContext";

export type RepeatMode = "off" | "all" | "one";

/** How far (seconds) a Jam listener may drift from the shared playhead before we re-seek. */
const JAM_SYNC_TOLERANCE = 0.75;
const JAM_DRIFT_CHECK_MS = 3000;
/** How often (ms) the position in a podcast episode is saved while it plays. */
const EPISODE_SAVE_MS = 15_000;
/** Resuming an episode goes back a little, to pick up the thread. */
const EPISODE_RESUME_REWIND = 3;
const RATE_KEY = "spotifiak.podcastRate";

function loadRate(): number {
  try {
    const r = Number(localStorage.getItem(RATE_KEY));
    return PLAYBACK_RATES.includes(r) ? r : 1;
  } catch {
    return 1;
  }
}

/** Where to start a queue: used when playback is moved here from another device. */
export interface PlayQueueOptions {
  /** Start position in the first track, in seconds. */
  position?: number;
  /** Load it paused instead of playing. */
  paused?: boolean;
}

/**
 * This device's own player. The app uses usePlayer() (ConnectContext), which
 * shows this one, or the account's playing device when that's another one.
 */
export interface PlayerContextValue {
  queue: Child[];
  currentIndex: number;
  current: Child | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** True while in a Jam: playback follows the shared session. */
  inJam: boolean;
  /** False for Jam guests the host hasn't given playback control. */
  canControl: boolean;
  /** The browser refused to start audio without a click (e.g. after reloading mid-Jam). */
  audioBlocked: boolean;
  resumeAudio: () => void;
  playQueue: (tracks: Child[], startIndex?: number, options?: PlayQueueOptions) => void;
  enqueue: (tracks: Child[]) => void;
  /** Inserts tracks right after the current one (in a Jam, which has no such place: adds them). */
  addNext: (tracks: Child[]) => void;
  /** Plays queue[index]. */
  jumpTo: (index: number) => void;
  /** Removes queue[index]; not the current track. */
  removeAt: (index: number) => void;
  /** Moves queue[from] to index `to`. Not in a Jam, which has no order to change. */
  moveTrack: (from: number, to: number) => void;
  togglePlay: () => void;
  playNext: () => void;
  playPrevious: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  /** Bumped on every seek (so the playback can be republished to other devices). */
  seekCount: number;
  /** Podcast episodes' speed (songs always play at 1, and so does a Jam, to stay in sync). */
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
}

const LocalPlayerContext = createContext<PlayerContextValue | undefined>(undefined);

/**
 * Seeks only within what the browser says is seekable. Transcoded Navidrome
 * streams aren't seekable, and forcing currentTime there restarts the track -
 * which would make Jam drift correction stutter forever.
 */
function seekIfPossible(audio: HTMLAudioElement, seconds: number) {
  const ranges = audio.seekable;
  for (let i = 0; i < ranges.length; i++) {
    if (seconds >= ranges.start(i) && seconds <= ranges.end(i)) {
      audio.currentTime = seconds;
      return;
    }
  }
}

/** Media Session calls fail where the API is missing (some browsers); it's an extra, so ignore that. */
function ignoreError() {}

export function LocalPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrobbledRef = useRef(false);
  const lastDriftCheckRef = useRef(0);

  const { jamId, jam, canControl: jamCanControl, act, expectedPosition } = useJam();
  const inJam = jamId !== null;
  const canControl = !inJam || jamCanControl;

  const [localQueue, setLocalQueue] = useState<Child[]>([]);
  // For playNext: reading the queue inside setLocalIndex's updater must not
  // nest state updates (React may run updaters twice, skipping two tracks).
  const localQueueRef = useRef(localQueue);
  localQueueRef.current = localQueue;
  const [localIndex, setLocalIndex] = useState(-1);
  const localIndexRef = useRef(localIndex);
  localIndexRef.current = localIndex;
  const [localPlaying, setLocalPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [seekCount, setSeekCount] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(loadRate);
  /** When the current episode's position was last saved. */
  const episodeSavedAtRef = useRef(0);
  /** The track the <audio> has loaded (`current` moves on before it does). */
  const loadedRef = useRef<Child | null>(null);
  // Options of the playQueue() call that loaded the current queue, used once by the load effect.
  const pendingStartRef = useRef<PlayQueueOptions | null>(null);

  const jamQueue = useMemo<Child[]>(() => jam?.queue.map((item) => item.track) ?? [], [jam?.queue]);
  const jamItem = jam && jam.currentIndex >= 0 ? (jam.queue[jam.currentIndex] ?? null) : null;

  const queue = inJam ? jamQueue : localQueue;
  const currentIndex = inJam ? (jam && jamItem ? jam.currentIndex : -1) : localIndex;
  const current = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;
  // In a Jam the same song can be queued twice, so key on the queue item.
  const sourceKey = inJam ? `jam:${jamItem?.uid ?? ""}` : `local:${current?.id ?? ""}`;
  const isPlaying = inJam ? Boolean(jam?.playing && jamItem) : localPlaying;

  // Joining a Jam replaces whatever was playing; leaving it starts from silence.
  useEffect(() => {
    if (!inJam) return;
    setLocalQueue([]);
    setLocalIndex(-1);
  }, [inJam]);

  const tryPlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio
      .play()
      .then(() => {
        setLocalPlaying(true);
        setAudioBlocked(false);
      })
      .catch((err: unknown) => {
        setLocalPlaying(false);
        if (err instanceof DOMException && err.name === "NotAllowedError") setAudioBlocked(true);
      });
  }, []);

  // Load a new source whenever the current track changes.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    // Leaving an episode partway: remember where.
    const previous = loadedRef.current;
    if (previous && isEpisode(previous) && audio.readyState > 0 && !audio.ended) {
      recordProgress(previous.id, audio.currentTime, Number.isFinite(audio.duration) ? audio.duration : (previous.duration ?? 0));
    }
    loadedRef.current = current;
    if (!current) {
      audio.pause();
      audio.removeAttribute("src");
      return;
    }
    scrobbledRef.current = false;
    episodeSavedAtRef.current = Date.now();
    const episode = isEpisode(current) && current.src;
    audio.src = episode || streamUrl(current.id);
    if (inJam) {
      audio.currentTime = expectedPosition();
      if (jam?.playing) tryPlay();
    } else {
      const start = pendingStartRef.current;
      pendingStartRef.current = null;
      // An episode carries on where you left it.
      const saved = episode ? getEpisodeProgress(current.id) : undefined;
      const resume = saved && !saved.done ? Math.max(0, saved.p - EPISODE_RESUME_REWIND) : 0;
      audio.currentTime = start?.position ?? resume;
      if (start?.paused) setLocalPlaying(false);
      else tryPlay();
    }
    // Best-effort "now playing", which other users see in Friend activity (songs only: Navidrome doesn't know episodes).
    // Not for a Jam's songs: they're the group's, not yours.
    if (!episode && !inJam && getShareListening()) scrobble(current.id, false).catch(() => void 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  // Follow the Jam's shared play/pause/seek state.
  useEffect(() => {
    const audio = audioRef.current;
    if (!inJam || !jam || !jamItem || !audio || !audio.src) return;
    if (jam.playing) {
      const expected = expectedPosition();
      if (Math.abs(audio.currentTime - expected) > JAM_SYNC_TOLERANCE) seekIfPossible(audio, expected);
      if (audio.paused) tryPlay();
    } else {
      if (!audio.paused) audio.pause();
      if (Math.abs(audio.currentTime - jam.position) > 0.25) seekIfPossible(audio, jam.position);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jam]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // A karaoke Jam plays on its TV: this device follows along silently.
  const karaokeOn = Boolean(inJam && jam?.karaoke?.on);
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = karaokeOn;
  }, [karaokeOn]);

  // Speed: episodes only, and never in a Jam. A new source resets it, hence sourceKey.
  const effectiveRate = isEpisode(current) && !inJam ? playbackRate : 1;
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.defaultPlaybackRate = effectiveRate;
    audio.playbackRate = effectiveRate;
  }, [effectiveRate, sourceKey]);

  const setPlaybackRate = useCallback((rate: number) => {
    if (!PLAYBACK_RATES.includes(rate)) return;
    setPlaybackRateState(rate);
    try {
      localStorage.setItem(RATE_KEY, String(rate));
    } catch {
      // Not remembered on this device, that's all.
    }
  }, []);

  /** Saves where we are in the current episode (if it is one). */
  const saveEpisodePosition = useCallback(
    (played?: boolean) => {
      const audio = audioRef.current;
      const track = loadedRef.current;
      // Nothing loaded yet (e.g. the pause a new source causes): nothing to save.
      if (!audio || !track || !isEpisode(track) || audio.readyState === 0) return;
      episodeSavedAtRef.current = Date.now();
      const total = Number.isFinite(audio.duration) ? audio.duration : (track.duration ?? 0);
      recordProgress(track.id, audio.currentTime, total, played);
    },
    [],
  );

  const resumeAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (inJam) seekIfPossible(audio, expectedPosition());
    tryPlay();
  }, [inJam, expectedPosition, tryPlay]);

  const playNext = useCallback(() => {
    if (inJam) {
      if (canControl) void act({ type: "next" });
      return;
    }
    setLocalIndex((idx) => {
      const q = localQueueRef.current;
      if (q.length === 0) return -1;
      if (shuffle) return Math.floor(Math.random() * q.length);
      const next = idx + 1;
      if (next < q.length) return next;
      return repeat === "all" ? 0 : idx; // stay put at end of queue
    });
  }, [inJam, canControl, act, shuffle, repeat]);

  const playPrevious = useCallback(() => {
    if (inJam) {
      if (canControl) void act({ type: "previous" });
      return;
    }
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    setLocalIndex((idx) => Math.max(0, idx - 1));
  }, [inJam, canControl, act]);

  const playQueue = useCallback(
    (tracks: Child[], startIndex = 0, options?: PlayQueueOptions) => {
      if (inJam) {
        // In a Jam, "play" means play it for everyone (if allowed) - otherwise
        // it's queued for the group, like Spotify. Several tracks are a
        // playlist or album: it plays when nobody has added a song, so a
        // guest's goes after everything else.
        const toSend = tracks.slice(startIndex).map(toJamTrack);
        if (!toSend.length) return;
        if (canControl) void act({ type: "playNow", tracks: toSend });
        else void act({ type: "add", tracks: toSend, fallback: toSend.length > 1 });
        return;
      }
      setLocalQueue(tracks);
      setLocalIndex(tracks.length ? startIndex : -1);
      const audio = audioRef.current;
      if (audio && tracks[startIndex]?.id === current?.id) {
        // Same track already loaded: the load effect won't run, so start it here.
        audio.currentTime = options?.position ?? 0;
        if (options?.paused) {
          audio.pause();
          setLocalPlaying(false);
        } else {
          tryPlay();
        }
        return;
      }
      pendingStartRef.current = options ?? null;
    },
    [inJam, canControl, act, current?.id, tryPlay],
  );

  const enqueue = useCallback(
    (tracks: Child[]) => {
      if (inJam) {
        if (tracks.length) void act({ type: "add", tracks: tracks.map(toJamTrack) });
        return;
      }
      setLocalQueue((q) => [...q, ...tracks]);
    },
    [inJam, act],
  );

  // Queue edits read and update the refs right away, so quick successive
  // edits (e.g. two drags) each see the previous one before React re-renders.
  const setQueueAndIndex = useCallback((q: Child[], index: number) => {
    localQueueRef.current = q;
    localIndexRef.current = index;
    setLocalQueue(q);
    setLocalIndex(index);
  }, []);

  const addNext = useCallback(
    (tracks: Child[]) => {
      if (inJam) {
        if (tracks.length) void act({ type: "add", tracks: tracks.map(toJamTrack) });
        return;
      }
      const q = localQueueRef.current;
      const at = localIndexRef.current + 1;
      setQueueAndIndex([...q.slice(0, at), ...tracks, ...q.slice(at)], localIndexRef.current);
    },
    [inJam, act, setQueueAndIndex],
  );

  const jumpTo = useCallback(
    (index: number) => {
      if (inJam) {
        const item = jam?.queue[index];
        if (item && canControl) void act({ type: "jump", uid: item.uid });
        return;
      }
      const q = localQueueRef.current;
      if (index < 0 || index >= q.length) return;
      const audio = audioRef.current;
      if (audio && q[index].id === q[localIndexRef.current]?.id) {
        // Same song: the load effect won't run, so restart it here.
        audio.currentTime = 0;
        tryPlay();
      }
      setQueueAndIndex(q, index);
    },
    [inJam, jam?.queue, canControl, act, tryPlay, setQueueAndIndex],
  );

  const removeAt = useCallback(
    (index: number) => {
      if (inJam) {
        const item = jam?.queue[index];
        if (item) void act({ type: "remove", uid: item.uid });
        return;
      }
      const q = localQueueRef.current;
      const cur = localIndexRef.current;
      if (index < 0 || index >= q.length || index === cur) return;
      setQueueAndIndex(
        q.filter((_, i) => i !== index),
        index < cur ? cur - 1 : cur,
      );
    },
    [inJam, jam?.queue, act, setQueueAndIndex],
  );

  const moveTrack = useCallback(
    (from: number, to: number) => {
      const q = localQueueRef.current;
      if (inJam || from === to || from < 0 || to < 0 || from >= q.length || to >= q.length) return;
      const next = [...q];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      // Keep the current track current, wherever it ends up.
      const cur = localIndexRef.current;
      let index = cur;
      if (from === cur) index = to;
      else if (from < cur && to >= cur) index = cur - 1;
      else if (from > cur && to <= cur) index = cur + 1;
      setQueueAndIndex(next, index);
    },
    [inJam, setQueueAndIndex],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (inJam) {
      // A click is exactly what a blocked browser needs to start audio.
      if (audioBlocked && jam?.playing) resumeAudio();
      else if (canControl) void act({ type: jam?.playing ? "pause" : "resume" });
      return;
    }
    if (audio.paused) {
      tryPlay();
    } else {
      audio.pause();
      setLocalPlaying(false);
    }
  }, [current, inJam, audioBlocked, jam?.playing, canControl, act, resumeAudio, tryPlay]);

  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (inJam) {
        if (!canControl) return;
        void act({ type: "seek", position: seconds });
      }
      audio.currentTime = seconds;
      setProgress(seconds);
    },
    [inJam, canControl, act],
  );

  // Lock screen, notification and media keys (via the Media Session API, or
  // natively on Android: see lib/mediaSession.ts). On Android this also keeps
  // a foreground service running while music plays, so playback - including
  // moving on to the next track - carries on with the app in the background.
  const mediaControlsRef = useRef({ isPlaying, togglePlay, playNext, playPrevious, seek });
  mediaControlsRef.current = { isPlaying, togglePlay, playNext, playPrevious, seek };

  useEffect(() => {
    const controls = mediaControlsRef;
    const handlers: [MediaSessionAction, ActionHandler][] = [
      ["play", () => !controls.current.isPlaying && controls.current.togglePlay()],
      ["pause", () => controls.current.isPlaying && controls.current.togglePlay()],
      ["nexttrack", () => controls.current.playNext()],
      ["previoustrack", () => controls.current.playPrevious()],
      ["seekto", ({ seekTime }) => seekTime != null && controls.current.seek(seekTime)],
      ["seekbackward", () => controls.current.seek(Math.max(0, (audioRef.current?.currentTime ?? 0) - SKIP_BACK))],
      ["seekforward", () => controls.current.seek((audioRef.current?.currentTime ?? 0) + SKIP_FORWARD)],
    ];
    for (const [action, handler] of handlers) {
      MediaSession.setActionHandler({ action }, handler).catch(ignoreError);
    }
  }, []);

  useEffect(() => {
    if (!current) return;
    MediaSession.setMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album,
      artwork: [{ src: coverArtUrl(current.coverArt, 512), sizes: "512x512" }],
    }).catch(ignoreError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  useEffect(() => {
    const playbackState = !current ? "none" : isPlaying ? "playing" : "paused";
    MediaSession.setPlaybackState({ playbackState }).catch(ignoreError);
  }, [current, isPlaying]);

  const updatePositionState = useCallback(() => {
    const audio = audioRef.current;
    // Transcoded streams report an infinite duration; fall back to Navidrome's.
    const total = audio && Number.isFinite(audio.duration) ? audio.duration : current?.duration;
    if (!audio || !total) return;
    MediaSession.setPositionState({
      duration: total,
      position: Math.min(audio.currentTime, total),
      playbackRate: effectiveRate,
    }).catch(ignoreError);
  }, [current?.duration, effectiveRate]);

  useEffect(updatePositionState, [isPlaying, duration, updatePositionState]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.min(1, Math.max(0, v)));
  }, []);

  // Shuffle/repeat are personal-queue features; a Jam plays its queue in order.
  const toggleShuffle = useCallback(() => {
    if (!inJam) setShuffle((s) => !s);
  }, [inJam]);
  const cycleRepeat = useCallback(() => {
    if (!inJam) setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, [inJam]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      currentIndex,
      current,
      isPlaying,
      progress,
      duration,
      volume,
      shuffle: shuffle && !inJam,
      repeat: inJam ? "off" : repeat,
      inJam,
      canControl,
      audioBlocked,
      resumeAudio,
      playQueue,
      enqueue,
      addNext,
      jumpTo,
      removeAt,
      moveTrack,
      togglePlay,
      playNext,
      playPrevious,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
      seekCount,
      playbackRate,
      setPlaybackRate,
    }),
    [
      queue,
      currentIndex,
      current,
      isPlaying,
      progress,
      duration,
      volume,
      shuffle,
      repeat,
      inJam,
      canControl,
      audioBlocked,
      resumeAudio,
      playQueue,
      enqueue,
      addNext,
      jumpTo,
      removeAt,
      moveTrack,
      togglePlay,
      playNext,
      playPrevious,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
      seekCount,
      playbackRate,
      setPlaybackRate,
    ],
  );

  return (
    <LocalPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          const audio = e.currentTarget;
          const t = audio.currentTime;
          setProgress(t);
          if (isEpisode(current)) {
            if (!audio.paused && Date.now() - episodeSavedAtRef.current > EPISODE_SAVE_MS) saveEpisodePosition();
          } else if (!scrobbledRef.current && current?.duration && t > current.duration * 0.5) {
            scrobbledRef.current = true;
            if (inJam) {
              // A Jam's song counts once for everyone, and stays out of your own plays (your
              // history, the scoreboard, your top songs for mixes).
              if (jamId && jamItem) reportStream(current.id, { id: jamId, uid: jamItem.uid }).catch(() => void 0);
            } else {
              scrobble(current.id, true).catch(() => void 0);
              reportStream(current.id).catch(() => void 0);
              if (getShareListening()) reportPlay(current.id).catch(() => void 0);
            }
          }
          // Periodically pull this device back onto the Jam's shared playhead.
          if (inJam && jam?.playing && !audio.seeking && Date.now() - lastDriftCheckRef.current > JAM_DRIFT_CHECK_MS) {
            lastDriftCheckRef.current = Date.now();
            const expected = expectedPosition();
            if (Math.abs(t - expected) > JAM_SYNC_TOLERANCE) seekIfPossible(audio, expected);
          }
        }}
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          setDuration(audio.duration);
          if (inJam && jam) seekIfPossible(audio, expectedPosition());
        }}
        onSeeked={() => {
          updatePositionState();
          setSeekCount((n) => n + 1);
        }}
        onPlay={() => setLocalPlaying(true)}
        onPause={(e) => {
          setLocalPlaying(false);
          // Not when it ended or moved on: those save themselves.
          if (!e.currentTarget.ended) saveEpisodePosition();
        }}
        onEnded={() => {
          saveEpisodePosition(true);
          if (inJam) {
            // Every listener reports; the server only advances once per track.
            if (jamItem) void act({ type: "ended", uid: jamItem.uid });
            return;
          }
          if (repeat === "one") {
            const audio = audioRef.current;
            if (audio) {
              audio.currentTime = 0;
              audio.play().catch(() => void 0);
            }
            return;
          }
          playNext();
        }}
      />
    </LocalPlayerContext.Provider>
  );
}

export function useLocalPlayer(): PlayerContextValue {
  const ctx = useContext(LocalPlayerContext);
  if (!ctx) throw new Error("useLocalPlayer must be used within a LocalPlayerProvider");
  return ctx;
}
