import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";

// Client for podcasts (server/podcasts.mjs): the Jam server reads the shows'
// feeds and keeps each person's subscriptions and listening progress.

export interface PodcastShow {
  id: string;
  feedUrl: string;
  title: string;
  author: string;
  image: string;
  description?: string;
}

export interface PodcastEpisode {
  /** "ep:" and a hash of the feed and the episode's guid. */
  id: string;
  title: string;
  /** ms since epoch; 0 if the feed doesn't say. */
  published: number;
  /** Seconds; 0 if the feed doesn't say. */
  duration: number;
  /** The audio file, from the publisher. */
  src: string;
  image: string;
  description: string;
  podcastId: string;
  show: string;
  author: string;
}

/** Where someone is in an episode. */
export interface EpisodeProgress {
  /** Position, seconds. */
  p: number;
  /** Duration, seconds (0 if unknown). */
  d: number;
  done: boolean;
  /** When it was last saved, ms since epoch. */
  at: number;
}

export interface PodcastsState {
  shows: (PodcastShow & { subscribedAt: number })[];
  progress: Record<string, EpisodeProgress>;
  persisted: boolean;
}

async function call<T>(path: string, params: Record<string, string> = {}, body?: unknown): Promise<T> {
  const base = jamBase();
  if (base === null) throw new Error("Podcasts need a Jam server. Set one in Settings.");
  let res: Response;
  try {
    res = await fetch(`${base}/jam-api/podcasts${path}?${authSearchParams(params)}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `The server couldn't do that right now (${res.status}).`);
  return data as T;
}

export function getPodcasts(): Promise<PodcastsState> {
  return call("");
}

/** Shows from the Apple Podcasts directory, or the show a feed link is. */
export async function searchPodcasts(q: string): Promise<PodcastShow[]> {
  return (await call<{ results: PodcastShow[] }>("/search", { q })).results;
}

/** A show and its episodes, newest first: by `feedUrl`, or by id for a show you follow or found. */
export function getPodcastFeed(
  show: { id: string; feedUrl?: string },
  fresh = false,
): Promise<{ show: PodcastShow; episodes: PodcastEpisode[] }> {
  const params: Record<string, string> = show.feedUrl ? { url: show.feedUrl } : { id: show.id };
  if (fresh) params.fresh = "1";
  return call("/feed", params);
}

/** The newest episodes of the shows you follow. */
export function getLatestEpisodes(): Promise<{ episodes: PodcastEpisode[] }> {
  return call("/latest");
}

export function subscribe(feedUrl: string): Promise<PodcastsState> {
  return call("/subscribe", {}, { feedUrl });
}

export function unsubscribe(id: string): Promise<PodcastsState> {
  return call("/unsubscribe", {}, { id });
}

export async function saveProgress(
  id: string,
  update: { position: number; duration: number; played?: boolean },
): Promise<EpisodeProgress> {
  return (await call<{ progress: EpisodeProgress }>("/progress", {}, { id, ...update })).progress;
}
