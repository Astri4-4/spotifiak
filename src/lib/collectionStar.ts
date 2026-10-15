import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getStarred2, star, unstar } from "@/api/subsonic";

// Liked albums and artists (Navidrome's stars), shared by the album and artist
// pages' hearts and the Library's "Liked" filter. Loaded once from the server
// (getStarred2); likes changed here update it right away.

export type CollectionKind = "album" | "artist";

interface State {
  album: ReadonlySet<string>;
  artist: ReadonlySet<string>;
  loaded: boolean;
}

let state: State = { album: new Set(), artist: new Set(), loaded: false };
let loading = false;
/** Changed here while the list was loading: the server's answer may predate them. */
const pendingChanges = new Map<string, boolean>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(next: State) {
  state = next;
  for (const l of listeners) l();
}

function withLike(base: State, kind: CollectionKind, id: string, liked: boolean): State {
  const ids = new Set(base[kind]);
  if (liked) ids.add(id);
  else ids.delete(id);
  return { ...base, [kind]: ids };
}

function load() {
  if (loading || state.loaded) return;
  loading = true;
  getStarred2()
    .then((starred) => {
      let next: State = {
        album: new Set((starred.album ?? []).map((a) => a.id)),
        artist: new Set((starred.artist ?? []).map((a) => a.id)),
        loaded: true,
      };
      for (const [key, liked] of pendingChanges) {
        const [kind, id] = key.split(":") as [CollectionKind, string];
        next = withLike(next, kind, id, liked);
      }
      pendingChanges.clear();
      setState(next);
    })
    .catch(() => void 0) // Tried again next time something needs it.
    .finally(() => {
      loading = false;
    });
}

/** The ids of the liked albums and artists (empty sets until loaded). */
export function useLikedCollections(): State {
  useEffect(load, []);
  return useSyncExternalStore(subscribe, () => state);
}

/**
 * Whether an album or artist is liked, and a toggle that updates the server.
 * `starred`: the album's or artist's own field, shown until the list is loaded.
 */
export function useCollectionStar(kind: CollectionKind, id: string, starred?: string) {
  const collections = useLikedCollections();
  const liked = collections.loaded ? collections[kind].has(id) : Boolean(starred);

  const toggle = useCallback(async () => {
    const next = !liked;
    const apply = (value: boolean) => {
      if (!state.loaded) pendingChanges.set(`${kind}:${id}`, value);
      setState(withLike(state, kind, id, value));
    };
    apply(next);
    try {
      await (next ? star : unstar)(kind === "album" ? { albumId: [id] } : { artistId: [id] });
      return true;
    } catch {
      apply(!next);
      return false;
    }
  }, [kind, id, liked]);

  return { liked, toggle };
}
