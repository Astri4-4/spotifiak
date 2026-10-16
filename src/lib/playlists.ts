import { useEffect, useSyncExternalStore } from "react";
import { getPlaylists } from "@/api/subsonic";
import { loadCredentials } from "@/api/client";
import type { Playlist } from "@/types/subsonic";
import { sameUser } from "./names";

// Your playlists, shared by everything that lists them (the sidebar, Your
// Library, "Add to playlist"), so a playlist created, renamed or deleted
// anywhere shows up everywhere.
//
// Navidrome also lists other people's public playlists (and all of them to
// admins): they're left out, so each person only sees their own. Whether
// yours are public is up to you, on the playlist's page.

let playlists: Playlist[] | null = null;
let loading = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether you own it (Navidrome only lets the owner change a playlist). */
export function isOwnPlaylist(playlist: Pick<Playlist, "owner">): boolean {
  return !playlist.owner || sameUser(playlist.owner, loadCredentials()?.username);
}

/** Your playlists: other people's are left out. */
export async function getOwnPlaylists(): Promise<Playlist[]> {
  return (await getPlaylists()).filter(isOwnPlaylist);
}

/** Reloads the playlists; call after changing one. */
export function refreshPlaylists() {
  loading = true;
  getOwnPlaylists()
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
