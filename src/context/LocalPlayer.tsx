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
import { MediaSession, type ActionHandler, type MediaSessionAction } from "@capgo/capacitor-media-session";
import { coverArtUrl, scrobble, streamUrl } from "@/api/subsonic";
import { toJamTrack } from "@/api/jam";
import type { Child } from "@/types/subsonic";
import { useJam } from "./JamContext";

export type RepeatMode = "off" | "all" | "one";

/** How far (seconds) a Jam listener may drift from the shared playhead before we re-seek. */
const JAM_SYNC_TOLERANCE = 0.75;
const JAM_DRIFT_CHECK_MS = 3000;

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
  togglePlay: () => void;
  playNext: () => void;
  playPrevious: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  /** Bumped on every seek (so the playback can be republished to other devices). */
  seekCount: number;
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
  const [localPlaying, setLocalPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [seekCount, setSeekCount] = useState(0);
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
    if (!current) {
      audio.pause();
      audio.removeAttribute("src");
      return;
    }
    scrobbledRef.current = false;
    audio.src = streamUrl(current.id);
    if (inJam) {
      audio.currentTime = expectedPosition();
      if (jam?.playing) tryPlay();
    } else {
      const start = pendingStartRef.current;
      pendingStartRef.current = null;
      audio.currentTime = start?.position ?? 0;
      if (start?.paused) setLocalPlaying(false);
      else tryPlay();
    }
    scrobble(current.id, false).catch(() => void 0); // best-effort "now playing"
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
        // it's queued for the group, like Spotify.
        const toSend = tracks.slice(startIndex).map(toJamTrack);
        if (toSend.length) void act({ type: canControl ? "playNow" : "add", tracks: toSend });
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
  // natively on Android). On Android this also keeps a foreground service
  // running while music plays, so playback - including moving on to the
  // next track - carries on with the app in the background.
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
      playbackRate: 1,
    }).catch(ignoreError);
  }, [current?.duration]);

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
      togglePlay,
      playNext,
      playPrevious,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
      seekCount,
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
      togglePlay,
      playNext,
      playPrevious,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
      seekCount,
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
          if (!scrobbledRef.current && current?.duration && t > current.duration * 0.5) {
            scrobbledRef.current = true;
            scrobble(current.id, true).catch(() => void 0);
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
        onPause={() => setLocalPlaying(false)}
        onEnded={() => {
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
