import { useEffect, useState } from "react";
import { getStreamCounts, type StreamKind } from "@/api/streams";

// Stream counts for the pages: how many times everyone played a song, album
// or artist (server/streams.mjs).

const NONE: Record<string, number> = {};

/**
 * How many times everyone played these, by id; null while loading, and
 * without a Jam server (the page then just doesn't show them).
 */
export function useStreamCounts(kind: StreamKind, ids: string[]): Record<string, number> | null {
  const key = ids.join(",");
  const [result, setResult] = useState<{ key: string; counts: Record<string, number> } | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getStreamCounts({ [kind]: key.split(",") })
      .then((c) => !cancelled && setResult({ key, counts: c[kind] ?? NONE }))
      .catch(() => void 0);
    return () => {
      cancelled = true;
    };
  }, [kind, key]);

  if (!key) return NONE;
  return result?.key === key ? result.counts : null;
}

/** One song, album or artist's count; null while loading or unavailable. */
export function useStreamCount(kind: StreamKind, id: string | undefined): number | null {
  const counts = useStreamCounts(kind, id ? [id] : []);
  return id && counts ? (counts[id] ?? 0) : null;
}
