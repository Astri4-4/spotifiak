import { useEffect, useSyncExternalStore } from "react";
import {
  getPodcasts,
  saveProgress,
  subscribe as subscribeTo,
  unsubscribe as unsubscribeFrom,
  type EpisodeProgress,
  type PodcastEpisode,
  type PodcastsState,
} from "@/api/podcasts";
import type { Child } from "@/types/subsonic";

// Your podcasts and where you are in each episode, kept by the Jam server so
// they follow you from device to device. Episodes play through the same
// queue as songs, as tracks with their own `src` (see episodeToTrack).

/** Episodes this close to the end (seconds) count as played. */
const PLAYED_MARGIN = 30;
/** The speeds episodes can play at. */
export const PLAYBACK_RATES = [0.8, 1, 1.2, 1.5, 1.8, 2];
/** The skip buttons (and media keys) jump this far, in seconds. */
export const SKIP_BACK = 15;
export const SKIP_FORWARD = 30;

let state: PodcastsState = { shows: [], progress: {}, persisted: true };
let loaded = false;
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function set(next: PodcastsState) {
  state = next;
  for (const l of listeners) l();
}

function load(username: string) {
  getPodcasts()
    .then((s) => {
      if (loadedFor !== username) return;
      loaded = true;
      // Progress saved here while it loaded wins over the server's older copy.
      set({ ...s, progress: { ...s.progress, ...pickNewer(state.progress, s.progress) } });
    })
    .catch(() => void 0); // No Jam server, or it's down: no podcasts.
}

function pickNewer(local: Record<string, EpisodeProgress>, remote: Record<string, EpisodeProgress>) {
  return Object.fromEntries(Object.entries(local).filter(([id, p]) => p.at > (remote[id]?.at ?? 0)));
}

/** Loads your podcasts once signed in. Mount once. */
export function usePodcastsLoader(username: string | null) {
  useEffect(() => {
    if (username === loadedFor) return;
    loadedFor = username;
    loaded = false;
    set({ shows: [], progress: {}, persisted: true });
    if (username) load(username);
  }, [username]);

  // Progress made on another device shows when you come back to this one.
  useEffect(() => {
    if (!username) return;
    const onVisible = () => document.visibilityState === "visible" && load(username);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [username]);
}

export function usePodcasts(): PodcastsState & { loaded: boolean } {
  const s = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
  return { ...s, loaded };
}

export function getEpisodeProgress(id: string): EpisodeProgress | undefined {
  return state.progress[id];
}

export async function follow(feedUrl: string) {
  set(await subscribeTo(feedUrl));
}

export async function unfollow(id: string) {
  set(await unsubscribeFrom(id));
}

/**
 * Remembers where you are in an episode (here at once, on the server in the
 * background). Near the end counts as played, and starts over next time.
 */
export function recordProgress(id: string, position: number, duration: number, played?: boolean) {
  const done = played ?? (duration > 0 && position >= duration - PLAYED_MARGIN);
  const previous = state.progress[id];
  const progress: EpisodeProgress = { p: done ? 0 : position, d: duration || previous?.d || 0, done, at: Date.now() };
  set({ ...state, progress: { ...state.progress, [id]: progress } });
  saveProgress(id, { position: progress.p, duration: progress.d, played: done }).catch(() => void 0);
}

/** Whether a queued track is a podcast episode rather than a song from Navidrome. */
export function isEpisode(track: Pick<Child, "id"> | null | undefined): boolean {
  return Boolean(track?.id.startsWith("ep:"));
}

/** An episode as a track for the player's queue. */
export function episodeToTrack(episode: PodcastEpisode): Child {
  return {
    id: episode.id,
    title: episode.title,
    artist: episode.show,
    album: episode.show,
    coverArt: episode.image || undefined,
    duration: episode.duration || undefined,
    src: episode.src,
    podcastId: episode.podcastId,
    type: "podcast",
  };
}

/** "Mar 3" this year, "Mar 3, 2024" before. */
export function formatPublished(ms: number): string {
  if (!ms) return "";
  const date = new Date(ms);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== new Date().getFullYear() && { year: "numeric" }),
  });
}

/** "45 min left", "Played", or the length. */
export function formatEpisodeStatus(episode: PodcastEpisode, progress: EpisodeProgress | undefined): string {
  if (progress?.done) return "Played";
  const total = episode.duration || progress?.d || 0;
  if (progress && progress.p > 0 && total > 0) {
    return `${Math.max(1, Math.round((total - progress.p) / 60))} min left`;
  }
  if (!total) return "";
  const minutes = Math.round(total / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes} min`;
}
