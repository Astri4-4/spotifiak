import { useEffect, useSyncExternalStore } from "react";
import { followArtist, getEvents, markEventsSeen, unfollowArtist, type EventsState } from "@/api/events";

// The event calendar's state, shared by the calendar page, the artist pages'
// Follow button and the sidebar's "new" count. Kept by the Jam server.

/** While artists are being looked up, check back this often. */
const PENDING_POLL_MS = 5000;

const EMPTY: EventsState = { artists: [], events: [], country: "", concertsAvailable: false, pending: 0, persisted: true };
let state: EventsState = EMPTY;
let loaded = false;
let loadedFor: string | null = null;
let pollTimer: number | undefined;
const listeners = new Set<() => void>();

function set(next: EventsState) {
  state = next;
  loaded = true;
  for (const l of listeners) l();
  // New artists are looked up in the background: pick up what's found.
  window.clearTimeout(pollTimer);
  if (next.pending > 0) pollTimer = window.setTimeout(() => void refreshEvents(), PENDING_POLL_MS);
}

export async function refreshEvents() {
  const username = loadedFor;
  try {
    const next = await getEvents();
    if (loadedFor === username) set(next);
  } catch {
    // No Jam server, or it's down: no calendar.
  }
}

/** Loads the calendar once signed in, and again when the app comes back. Mount once. */
export function useEventsLoader(username: string | null) {
  useEffect(() => {
    if (username === loadedFor) return;
    loadedFor = username;
    loaded = false;
    window.clearTimeout(pollTimer);
    state = EMPTY;
    for (const l of listeners) l();
    if (username) void refreshEvents();
  }, [username]);

  useEffect(() => {
    if (!username) return;
    const onVisible = () => document.visibilityState === "visible" && void refreshEvents();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [username]);
}

export function useEvents(): EventsState & { loaded: boolean; newCount: number } {
  const s = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
  return { ...s, loaded, newCount: s.events.filter((e) => e.isNew).length };
}

export async function follow(artist: { id: string; name: string; mbid?: string }) {
  set(await followArtist(artist));
}

export async function unfollow(id: string) {
  set(await unfollowArtist(id));
}

export function applyEvents(next: EventsState) {
  set(next);
}

/** Clears the "new" count; returns what was new, for the page to still show. */
export async function markSeen(): Promise<Set<string>> {
  const wasNew = new Set(state.events.filter((e) => e.isNew).map((e) => e.id));
  if (wasNew.size) set(await markEventsSeen());
  else void markEventsSeen().catch(() => void 0);
  return wasNew;
}

/** "Fri 16 Oct", "Oct 2026" or "2026", depending on what's known. */
export function formatEventDate(date: string, withYear = false): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!m) return String(y);
  if (!d) return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear && { year: "numeric" }),
  });
}
