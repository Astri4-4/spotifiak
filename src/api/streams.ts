import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";

// Client for the stream counts (server/streams.mjs), through the Jam server.

export type StreamKind = "songs" | "albums" | "artists";

export type StreamCounts = Record<StreamKind, Record<string, number>>;

/** How many times everyone played these songs, albums and artists. Throws without a Jam server. */
export async function getStreamCounts(ids: Partial<Record<StreamKind, string[]>>): Promise<StreamCounts> {
  const base = jamBase();
  if (base === null) throw new Error("Stream counts need a Jam server.");
  const query = authSearchParams();
  for (const [kind, list] of Object.entries(ids)) if (list?.length) query.set(kind, list.join(","));
  const res = await fetch(`${base}/jam-api/streams?${query}`);
  if (!res.ok) throw new Error(`Couldn't load the stream counts (${res.status}).`);
  return (await res.json()) as StreamCounts;
}

/** Counts a song you've played (half of it). In a Jam, the queue item it was, so it counts once for everyone. */
export async function reportStream(id: string, jam?: { id: string; uid: string }): Promise<void> {
  const base = jamBase();
  if (base === null) return;
  await fetch(`${base}/jam-api/streams/plays?${authSearchParams()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, jam }),
  });
}
