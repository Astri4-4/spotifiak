import { useSyncExternalStore } from "react";

// What the right-hand side panel shows: Friend activity, the queue, or the
// Jam - or nothing. The queue and Jam need a wide screen (WIDE_QUERY), and
// Friend activity a wider one (FRIENDS_QUERY); narrower screens have their
// pages instead.

export type RightPanel = "friends" | "queue" | "jam";

/** Wide enough for the queue or the Jam beside the page (Tailwind's `lg`). */
export const WIDE_QUERY = "(min-width: 1024px)";
/** Wide enough for Friend activity beside the page (Tailwind's `xl`). */
export const FRIENDS_QUERY = "(min-width: 1280px)";

const STORAGE_KEY = "spotifion.rightPanel";
const listeners = new Set<() => void>();

function read(): RightPanel | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "friends" || saved === "queue" || saved === "jam") return saved;
    if (saved === "none") return null;
    // Before the queue moved here, only Friend activity could be hidden.
    return localStorage.getItem("spotifion.friendsPanel") === "hidden" ? null : "friends";
  } catch {
    return "friends";
  }
}

let panel = read();
/** What closing the queue or Jam goes back to. */
let previous: RightPanel | null = panel === "friends" ? "friends" : null;

export function setRightPanel(value: RightPanel | null) {
  // Opening the queue or Jam over Friend activity (or nothing): remember which.
  if ((value === "queue" || value === "jam") && (panel === "friends" || panel === null)) previous = panel;
  panel = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ?? "none");
  } catch {
    // Not remembered next time.
  }
  for (const l of listeners) l();
}

/** Opens `value`, or closes it (back to what was there) if it's already open. */
export function toggleRightPanel(value: RightPanel) {
  setRightPanel(panel === value ? (value === "friends" ? null : previous) : value);
}

export function getRightPanel(): RightPanel | null {
  return panel;
}

export function useRightPanel(): RightPanel | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => panel,
  );
}

/** Whether the queue and Jam open beside the page rather than as pages. */
export function isWide(): boolean {
  return window.matchMedia(WIDE_QUERY).matches;
}

/** In a Jam, the queue is the Jam's: both show the Jam. */
export function shownPanel(value: RightPanel | null, inJam: boolean): RightPanel | null {
  return inJam && value === "queue" ? "jam" : value;
}

/** For the queue and Jam buttons: opens `target` beside the page, or closes it if it's showing. */
export function openOrCloseRightPanel(target: "queue" | "jam", inJam: boolean) {
  const want = shownPanel(target, inJam);
  if (shownPanel(panel, inJam) === want) toggleRightPanel(panel!);
  else setRightPanel(want);
}
