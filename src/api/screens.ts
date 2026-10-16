import { jamBase } from "@/lib/servers";
import type { JamSnapshot } from "./jam";
import type { StructuredLyrics } from "@/types/subsonic";

// The TV side of karaoke (server/jam.mjs, "TV screens"): no Navidrome login,
// just a code shown on screen that someone in a Jam enters, and a secret
// that only this TV knows.

export interface ScreenKey {
  code: string;
  secret: string;
}

/** What the screen's event stream says. */
export type ScreenEvent = { type: "screen"; jamId: string | null } | ({ type: "state" } & JamSnapshot) | { type: "ping"; now: number };

function base(): string {
  return `${jamBase() ?? ""}/jam-api/screens`;
}

export async function createScreen(): Promise<ScreenKey> {
  const res = await fetch(base(), { method: "POST" });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Couldn't start the screen (${res.status}).`);
  return data as ScreenKey;
}

export function screenEventsUrl({ code, secret }: ScreenKey): string {
  return `${base()}/${code}/events?secret=${secret}`;
}

/** A Navidrome call through the Jam the screen shows: "stream", "getCoverArt" or "getLyricsBySongId". */
export function screenRestUrl({ code, secret }: ScreenKey, endpoint: string, params: Record<string, string | number>): string {
  const query = new URLSearchParams({ secret });
  for (const [k, v] of Object.entries(params)) query.set(k, String(v));
  return `${base()}/${code}/rest/${endpoint}?${query}`;
}

export async function screenLyrics(key: ScreenKey, id: string): Promise<StructuredLyrics[]> {
  const res = await fetch(screenRestUrl(key, "getLyricsBySongId", { id }));
  const data = await res.json();
  return data?.["subsonic-response"]?.lyricsList?.structuredLyrics ?? [];
}

/** The song finished on the TV: the Jam moves on. */
export async function screenEnded(key: ScreenKey, uid: string): Promise<void> {
  await fetch(`${base()}/${key.code}/actions?secret=${key.secret}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "ended", uid }),
  });
}
