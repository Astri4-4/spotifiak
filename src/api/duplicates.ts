import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";

// Client for removing duplicate songs from the music files
// (server/duplicates.mjs), through the Jam server.

export interface DuplicateCopy {
  /** Navidrome song id. */
  id: string;
  /** The file, relative to the music folder. */
  path: string;
}

export interface DuplicateGroup {
  title: string;
  artist: string;
  keep: DuplicateCopy;
  /** Moved to the music folder's hidden trash. */
  remove: DuplicateCopy[];
}

export type DuplicatesKind = "album" | "playlist";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const base = jamBase();
  if (base === null) throw new Error("This needs a Jam server. Set one in Settings.");
  let res: Response;
  try {
    res = await fetch(`${base}/jam-api/duplicates${path}?${authSearchParams()}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `The server couldn't do that right now (${res.status}).`);
  return data as T;
}

/** Whether the server can change the music files. */
export async function duplicatesAvailable(): Promise<boolean> {
  try {
    return (await call<{ available: boolean }>("/config")).available;
  } catch {
    return false;
  }
}

/** What removing duplicates would move, without moving anything. */
export async function findDuplicates(kind: DuplicatesKind, id: string): Promise<DuplicateGroup[]> {
  return (await call<{ groups: DuplicateGroup[] }>("", { kind, id })).groups;
}

/** Moves the extra copies to the trash. The server works the list out again itself. */
export function removeDuplicates(
  kind: DuplicatesKind,
  id: string,
): Promise<{ groups: DuplicateGroup[]; moved: number; failed: string[] }> {
  return call("", { kind, id, apply: true });
}
