import { useState } from "react";
import type { Child } from "@/types/subsonic";

// Sorting and filtering long lists (a playlist, Liked Songs, the library):
// the choice is remembered per list kind on this device.

export interface SortOption<T> {
  id: string;
  label: string;
  /** Leaves the list in its own order when missing (e.g. a playlist's). */
  compare?: (a: T, b: T) => number;
  /** Its own order, reversed (e.g. "Recently added" in a playlist). */
  reverse?: boolean;
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
export const byText = (a: string | undefined, b: string | undefined) => collator.compare(a ?? "", b ?? "");
const byDate = (a: string | undefined, b: string | undefined) => Date.parse(b ?? "") - Date.parse(a ?? "") || 0;

/** For a list of songs in an order of its own (playlist, Liked Songs). */
export const SONG_SORTS: SortOption<Child>[] = [
  { id: "custom", label: "Custom order" },
  { id: "added", label: "Recently added", reverse: true },
  { id: "title", label: "Title", compare: (a, b) => byText(a.title, b.title) },
  { id: "artist", label: "Artist", compare: (a, b) => byText(a.artist, b.artist) || byText(a.album, b.album) || (a.track ?? 0) - (b.track ?? 0) },
  { id: "album", label: "Album", compare: (a, b) => byText(a.album, b.album) || (a.discNumber ?? 0) - (b.discNumber ?? 0) || (a.track ?? 0) - (b.track ?? 0) },
  { id: "duration", label: "Duration", compare: (a, b) => (a.duration ?? 0) - (b.duration ?? 0) },
  { id: "plays", label: "Most played", compare: (a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) },
  { id: "played", label: "Recently played", compare: (a, b) => byDate(a.played, b.played) },
];

const normalise = (s: string | undefined) =>
  (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Whether every word of `query` is in one of `fields` (accents and case don't matter). */
export function matches(query: string, ...fields: (string | undefined)[]): boolean {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fields.map(normalise).join(" ");
  return words.every((w) => text.includes(w));
}

/** The positions of `items` to show, filtered by `query` and in `sort`'s order. */
export function sortedIndices<T>(
  items: T[],
  sort: SortOption<T>,
  query: string,
  fields: (item: T) => (string | undefined)[],
): number[] {
  let indices = items.map((_, i) => i).filter((i) => matches(query, ...fields(items[i])));
  if (sort.compare) indices = indices.sort((a, b) => sort.compare!(items[a], items[b]) || a - b);
  else if (sort.reverse) indices = indices.reverse();
  return indices;
}

export const songFields = (s: Child) => [s.title, s.artist, s.album];

/** The chosen sort for a kind of list, remembered on this device. */
export function useSortChoice<T>(key: string, options: SortOption<T>[], fallback = options[0].id) {
  const storageKey = `spotifion.sort.${key}`;
  const [id, setId] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? fallback;
    } catch {
      return fallback;
    }
  });
  const sort = options.find((o) => o.id === id) ?? options.find((o) => o.id === fallback) ?? options[0];
  function choose(next: string) {
    setId(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Private mode: just for now then.
    }
  }
  return [sort, choose] as const;
}
