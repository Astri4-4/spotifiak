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
import { scrobble, streamUrl } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";

export type RepeatMode = "off" | "all" | "one";

interface PlayerContextValue {
  queue: Child[];
  currentIndex: number;
  current: Child | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  playQueue: (tracks: Child[], startIndex?: number) => void;
  enqueue: (tracks: Child[]) => void;
  togglePlay: () => void;
  playNext: () => void;
  playPrevious: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
}

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrobbledRef = useRef(false);

  const [queue, setQueue] = useState<Child[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");

  const current = currentIndex >= 0 ? (queue[currentIndex] ?? null) : null;

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
    audio.currentTime = 0;
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    scrobble(current.id, false).catch(() => void 0); // best-effort "now playing"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const playNext = useCallback(() => {
    setQueue((q) => {
      setCurrentIndex((idx) => {
        if (q.length === 0) return -1;
        if (shuffle) return Math.floor(Math.random() * q.length);
        const next = idx + 1;
        if (next < q.length) return next;
        return repeat === "all" ? 0 : idx; // stay put at end of queue
      });
      return q;
    });
  }, [shuffle, repeat]);

  const playPrevious = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    setCurrentIndex((idx) => Math.max(0, idx - 1));
  }, []);

  const playQueue = useCallback((tracks: Child[], startIndex = 0) => {
    setQueue(tracks);
    setCurrentIndex(tracks.length ? startIndex : -1);
  }, []);

  const enqueue = useCallback((tracks: Child[]) => {
    setQueue((q) => [...q, ...tracks]);
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => void 0);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [current]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setProgress(seconds);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(Math.min(1, Math.max(0, v)));
  }, []);

  const toggleShuffle = useCallback(() => setShuffle((s) => !s), []);
  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  }, []);

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      currentIndex,
      current,
      isPlaying,
      progress,
      duration,
      volume,
      shuffle,
      repeat,
      playQueue,
      enqueue,
      togglePlay,
      playNext,
      playPrevious,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
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
      playQueue,
      enqueue,
      togglePlay,
      playNext,
      playPrevious,
      seek,
      setVolume,
      toggleShuffle,
      cycleRepeat,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setProgress(t);
          if (!scrobbledRef.current && current?.duration && t > current.duration * 0.5) {
            scrobbledRef.current = true;
            scrobble(current.id, true).catch(() => void 0);
          }
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
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
    </PlayerContext.Provider>
  );
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider");
  return ctx;
}
