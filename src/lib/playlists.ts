import { useEffect, useSyncExternalStore } from "react";
import { getPlaylists } from "@/api/subsonic";
import type { Playlist } from "@/types/subsonic";

// The user's playlists, shared by everything that lists them (the sidebar,
// "Add to playlist"), so a playlist created, renamed or deleted anywhere
// shows up everywhere.

let playlists: Playlist[] | null = null;
let loading = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reloads the playlists; call after changing one. */
export function refreshPlaylists() {
  loading = true;
  getPlaylists()
    .then((list) => {
      playlists = list;
      for (const l of listeners) l();
    })
    .catch(() => void 0)
    .finally(() => {
      loading = false;
    });
}

/** The playlists, or null until they've loaded. */
export function usePlaylists(): Playlist[] | null {
  useEffect(() => {
    if (playlists === null && !loading) refreshPlaylists();
  }, []);
  return useSyncExternalStore(subscribe, () => playlists);
}
