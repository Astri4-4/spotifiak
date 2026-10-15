import { useEffect, useSyncExternalStore } from "react";
import { startScan } from "@/api/subsonic";
import {
  DiscoverError,
  discoverSearch,
  getDiscoverAlbumTracks,
  getDiscoverConfig,
  getDownloads,
  isDownloadDone,
  startDownload,
  type DiscoverAlbum,
  type DiscoverAlbumTrack,
  type DiscoverConfig,
  type DiscoverDownload,
  type DiscoverType,
} from "@/api/discover";
import { showToast } from "./songMenu";
import { titleKey } from "./format";
import type { AlbumWithSongsID3 } from "@/types/subsonic";

// Discover's shared state: whether the server offers it, and this user's
// downloads, followed while any is in progress.

const POLL_MS = 3000;

let config: DiscoverConfig | null = null;
let configLoading = false;
let downloads: DiscoverDownload[] = [];
let downloadsLoaded = false;
let pollTimer: number | undefined;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadDiscoverConfig() {
  configLoading = true;
  getDiscoverConfig()
    .then((c) => {
      config = c;
    })
    .catch(() => {
      // No Jam server, or one without Discover.
      config = { available: false, canEdit: false };
    })
    .finally(() => {
      configLoading = false;
      notify();
    });
}

export function setDiscoverConfig(next: DiscoverConfig) {
  config = next;
  notify();
}

/** The server's Discover setup, or null while loading. */
export function useDiscoverConfig(): DiscoverConfig | null {
  useEffect(() => {
    if (config === null && !configLoading) loadDiscoverConfig();
  }, []);
  return useSyncExternalStore(subscribe, () => config);
}

/** Navidrome finds new files by itself, but a scan (if allowed: admins) makes them show up sooner. */
function announceFinished(finished: DiscoverDownload[]) {
  for (const d of finished) {
    if (d.status === "completed") showToast(`Downloaded ${d.title}. It'll be in your library in a moment.`);
    else if (d.status === "withErrors") showToast(`Downloaded ${d.title}, but some songs failed.`);
    else if (d.status === "failed") showToast(`Couldn't download ${d.title}.`);
  }
  if (finished.some((d) => d.downloaded > 0 || d.status === "completed")) startScan().catch(() => void 0);
}

async function refresh() {
  window.clearTimeout(pollTimer);
  try {
    const next = await getDownloads();
    const wasPending = new Set(downloads.filter((d) => !isDownloadDone(d)).map((d) => d.uuid));
    if (downloadsLoaded) announceFinished(next.filter((d) => wasPending.has(d.uuid) && isDownloadDone(d)));
    downloads = next;
    downloadsLoaded = true;
    notify();
  } catch {
    // Try again on the next poll.
  }
  if (downloads.some((d) => !isDownloadDone(d))) pollTimer = window.setTimeout(refresh, POLL_MS);
}

/** This user's downloads (newest last), kept up to date while any is in progress. */
export function useDownloads(): DiscoverDownload[] {
  useEffect(() => {
    if (!downloadsLoaded) void refresh();
  }, []);
  return useSyncExternalStore(subscribe, () => downloads);
}

/** The download of a Deezer track or album, if one was started (deemix ids it "type_id_bitrate"). */
export function findDownload(list: DiscoverDownload[], type: DiscoverType, id: string): DiscoverDownload | undefined {
  const prefix = `${type}_${id}_`;
  for (let i = list.length - 1; i >= 0; i--) if (list[i].uuid.startsWith(prefix)) return list[i];
  return undefined;
}

export async function download(type: DiscoverType, id: string, title: string) {
  try {
    const added = await startDownload(type, id);
    downloads = [...downloads.filter((d) => !added.some((a) => a.uuid === d.uuid)), ...added];
    notify();
    showToast(`Downloading ${title}`);
  } catch (err) {
    if (err instanceof DiscoverError && err.status === 409) showToast(`${title} is already downloading`);
    else showToast(err instanceof Error ? err.message : `Couldn't download ${title}`);
  }
  void refresh();
}

/** What a library album lacks compared to the same album on Deezer. */
export interface AlbumGaps {
  deezer: DiscoverAlbum;
  missing: DiscoverAlbumTrack[];
}

const artistKey = (name: string) => titleKey(name.split(/\s*(?:,|&|\bfeat\.?|\bft\.?)\s*/i)[0] ?? name);

/**
 * Finds the album on Deezer and the tracks of it the library doesn't have.
 * Null when Deezer doesn't have it (or not clearly the same one). A track
 * counts as there when a song has its title, or failing that its place on the
 * album: better to miss a gap than to download a song twice.
 */
export async function findAlbumGaps(album: AlbumWithSongsID3): Promise<AlbumGaps | null> {
  const title = titleKey(album.name);
  const artist = artistKey(album.artist ?? "");
  if (!title) return null;
  const results = await discoverSearch(`${album.artist ?? ""} ${album.name}`.trim(), "album");
  const candidates = results.filter((r) => {
    const a = artistKey(r.artist);
    return titleKey(r.title) === title && (!artist || a === artist || a.includes(artist) || artist.includes(a));
  });
  // The same edition if Deezer has it (not the deluxe one's bonus tracks),
  // else the fullest with that title (not the 3-track single).
  const exact = (r: DiscoverAlbum) => (r.title.trim().toLowerCase() === album.name.trim().toLowerCase() ? 1 : 0);
  const deezer = candidates.sort((a, b) => exact(b) - exact(a) || b.trackCount - a.trackCount)[0];
  if (!deezer) return null;

  const songs = album.song ?? [];
  const titles = new Set(songs.map((s) => titleKey(s.title)));
  const places = new Set(songs.filter((s) => s.track).map((s) => `${s.discNumber ?? 1}-${s.track}`));
  const tracks = await getDiscoverAlbumTracks(deezer.id);
  const missing = tracks.filter((t) => t.available && !titles.has(titleKey(t.title)) && !places.has(`${t.disc}-${t.track}`));
  return { deezer, missing };
}

/** Downloads several Deezer tracks (an album's missing ones), with one message for all. */
export async function downloadTracks(ids: string[], label: string) {
  const added: DiscoverDownload[] = [];
  let failed = 0;
  for (const id of ids) {
    try {
      added.push(...(await startDownload("track", id)));
    } catch (err) {
      // Already downloading is fine: it's on its way.
      if (!(err instanceof DiscoverError && err.status === 409)) failed++;
    }
  }
  downloads = [...downloads.filter((d) => !added.some((a) => a.uuid === d.uuid)), ...added];
  notify();
  if (failed === ids.length) showToast(`Couldn't download ${label}`);
  else showToast(`Downloading ${label}${failed ? ` (${failed} couldn't start)` : ""}`);
  void refresh();
}
