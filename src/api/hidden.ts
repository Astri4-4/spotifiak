import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";

// Client for hidden duplicate songs (server/hidden.mjs), kept by the Jam
// server for each person.

export interface Hidden {
  /** Hidden copy's id → the id of the copy kept. */
  songs: Record<string, string>;
  /** Albums made only of hidden copies. */
  albums: string[];
}

async function call(path: string, body?: unknown): Promise<Hidden> {
  const base = jamBase();
  if (base === null) throw new Error("Hiding duplicates needs a Jam server. Set one in Settings.");
  let res: Response;
  try {
    res = await fetch(`${base}/jam-api/hidden${path}?${authSearchParams()}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `The server couldn't do that right now (${res.status}).`);
  return { songs: data.songs ?? {}, albums: data.albums ?? [] };
}

export function getHidden(): Promise<Hidden> {
  return call("");
}

export function hide(songs: Record<string, string>, albums: string[]): Promise<Hidden> {
  return call("", { songs, albums });
}

/** Shows these again, or everything with `all`. */
export function showAgain(what: { songs?: string[]; albums?: string[] } | { all: true }): Promise<Hidden> {
  return call("/show", what);
}
