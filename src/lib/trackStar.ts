import { useCallback, useSyncExternalStore } from "react";
import { star, unstar } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";

// Likes changed during this session, by track id, shared by every player
// control showing the current track (track objects carry the server's
// `starred` as of when they were loaded).
const overrides = new Map<string, boolean>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setStarred(id: string, value: boolean) {
  overrides.set(id, value);
  version++;
  for (const l of listeners) l();
}

/** Whether `track` is in Liked Songs, and a toggle that updates the server. */
export function useTrackStar(track: Child | null) {
  useSyncExternalStore(subscribe, () => version);
  const isStarred = track ? (overrides.get(track.id) ?? Boolean(track.starred)) : false;

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
