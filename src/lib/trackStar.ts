import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getSong, star, unstar } from "@/api/subsonic";
import { isEpisode } from "./podcasts";
import type { Child } from "@/types/subsonic";

// Whether songs are in Liked Songs, shared by every control showing one (the
// player, the song menu...). A track object's own `starred` can't be trusted:
// it's as of when it was loaded, and tracks from a Jam, another device or a
// mix don't carry it at all. So the server is asked when a song shows up,
// and likes changed here are kept too.
const known = new Map<string, boolean>();
/** When each song was last liked or unliked here, so an older answer from the server doesn't undo it. */
const changedAt = new Map<string, number>();
const fetching = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(id: string, value: boolean) {
  if (known.get(id) === value) return;
  known.set(id, value);
  version++;
  for (const l of listeners) l();
}

/** Records a like changed elsewhere in the app (e.g. a list's own heart), so the player shows it too. */
export function setStarred(id: string, value: boolean) {
  changedAt.set(id, Date.now());
  set(id, value);
}

/** Asks the server whether a song is liked (once at a time per song). */
function lookup(id: string) {
  // Podcast episodes aren't in Navidrome, so they can't be liked.
  if (fetching.has(id) || isEpisode({ id })) return;
  fetching.add(id);
  const startedAt = Date.now();
  getSong(id)
    .then((song) => {
      if ((changedAt.get(id) ?? 0) < startedAt) set(id, Boolean(song.starred));
    })
    .catch(() => void 0) // Offline: the track's own `starred` it is.
    .finally(() => fetching.delete(id));
}

/** Whether `track` is in Liked Songs, and a toggle that updates the server. */
export function useTrackStar(track: Child | null) {
  useSyncExternalStore(subscribe, () => version);
  const id = track?.id;
  const isStarred = track ? (known.get(track.id) ?? Boolean(track.starred)) : false;

  // Each time a song shows up: it may have been liked or unliked since, here or elsewhere.
  useEffect(() => {
    if (id) lookup(id);
  }, [id]);

  const toggle = useCallback(async () => {
    if (!track) return;
    const next = !isStarred;
    setStarred(track.id, next);
    try {
      await (next ? star : unstar)({ id: [track.id] });
    } catch {
      setStarred(track.id, !next); // non-critical; just undo the optimistic update
    }
  }, [track, isStarred]);

  return { isStarred, toggle };
}
