import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";

// Client for the event calendar (server/events.mjs): upcoming releases and
// concerts of the artists you follow, which the Jam server looks up.

export interface CalendarEvent {
  id: string;
  kind: "release" | "concert";
  /** "2026-10-16", or only "2026-10" / "2026" when that's all that's known (releases). */
  date: string;
  /** The venue's local time, "20:00" (concerts, when known). */
  time?: string;
  title: string;
  /** Releases: "Album", "Single", "EP · Live"... */
  type?: string;
  venue?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  /** Concerts: Ticketmaster's status when it isn't the usual, e.g. "cancelled", "postponed", "rescheduled". */
  status?: string;
  url: string;
  image?: string;
  artistId: string;
  artistName: string;
  /** Found since you last looked at the calendar. */
  isNew: boolean;
}

export interface FollowedArtist {
  id: string;
  name: string;
  /** null until looked up; false when MusicBrainz doesn't know them (so no releases). */
  matched: boolean | null;
}

export interface EventsState {
  artists: FollowedArtist[];
  events: CalendarEvent[];
  /** Concerts only in this country ("" for everywhere). */
  country: string;
  /** False until an admin sets a Ticketmaster key. */
  concertsAvailable: boolean;
  /** Your artists still being looked up. */
  pending: number;
  persisted: boolean;
}

export interface EventsConfig {
  concertsAvailable: boolean;
  canEdit: boolean;
  /** Admins: whether a key is set in Settings (rather than on the server). */
  hasKey?: boolean;
  persisted?: boolean;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const base = jamBase();
  if (base === null) throw new Error("The calendar needs a Jam server. Set one in Settings.");
  let res: Response;
  try {
    res = await fetch(`${base}/jam-api/events${path}?${authSearchParams()}`, {
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

export function getEvents(): Promise<EventsState> {
  return call("");
}

export function followArtist(artist: { id: string; name: string; mbid?: string }): Promise<EventsState> {
  return call("/follow", artist);
}

export function unfollowArtist(id: string): Promise<EventsState> {
  return call("/unfollow", { id });
}

export function setEventsCountry(country: string): Promise<EventsState> {
  return call("/settings", { country });
}

/** The calendar was looked at: what's there now isn't new any more. */
export function markEventsSeen(): Promise<EventsState> {
  return call("/seen", {});
}

/** The private link calendar apps subscribe to; `reset` makes a new one (the old one stops working). */
export async function getIcsUrl(reset = false): Promise<string> {
  const { token } = await call<{ token: string }>("/ics-token", { reset });
  const base = jamBase() || window.location.origin;
  return `${base}/jam-api/events/ics/${token}.ics`;
}

export function getEventsConfig(): Promise<EventsConfig> {
  return call("/config");
}

export function setTicketmasterKey(ticketmasterKey: string): Promise<EventsConfig> {
  return call("/config", { ticketmasterKey });
}
