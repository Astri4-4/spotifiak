import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";

// Client for the weekly scoreboard (server/scoreboard.mjs), through the Jam server.

export interface ScoreboardArtist {
  name: string;
  /** Navidrome artist id, "" if unknown. */
  id: string;
  plays: number;
}

export interface ScoreboardUser {
  username: string;
  /** Listening time this week. */
  seconds: number;
  plays: number;
  topArtists: ScoreboardArtist[];
}

export interface CommonArtist extends ScoreboardArtist {
  /** Who listened to them this week (at least two people). */
  listeners: string[];
}

export interface Scoreboard {
  /** Monday 00:00 of this week, in ms since epoch. */
  weekStart: number;
  /** Most listening time first. */
  users: ScoreboardUser[];
  /** Shared by the most people first. */
  common: CommonArtist[];
}

const NO_SCOREBOARD_SERVER = "The scoreboard needs a Jam server. Set one in Settings.";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const base = jamBase();
  if (base === null) throw new Error(NO_SCOREBOARD_SERVER);
  let res: Response;
  try {
    res = await fetch(`${base}/jam-api/scoreboard${path}?${authSearchParams()}`, {
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

export function getScoreboard(): Promise<Scoreboard> {
  return call("");
}

/** Counts a song you've played (half of it) towards this week's board. */
export async function reportPlay(id: string): Promise<void> {
  if (jamBase() === null) return;
  await call("/plays", { id });
}

/** Takes you off this week's board. */
export async function leaveScoreboard(): Promise<void> {
  if (jamBase() === null) return;
  await call("/leave", {});
}
