import { useEffect, useSyncExternalStore } from "react";
import { startScan } from "@/api/subsonic";
import {
  DiscoverError,
  getDiscoverConfig,
  getDownloads,
  isDownloadDone,
  startDownload,
  type DiscoverConfig,
  type DiscoverDownload,
  type DiscoverType,
} from "@/api/discover";
import { showToast } from "./songMenu";

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
