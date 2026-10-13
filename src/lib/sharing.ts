import { useSyncExternalStore } from "react";

// Whether this app tells Navidrome what you're playing ("now playing"),
// which is what other users of the server see in Friend activity. Plays are
// still scrobbled to your history either way.

const STORAGE_KEY = "spotifion.shareListening";
const listeners = new Set<() => void>();

export function getShareListening(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setShareListening(value: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Not saved: sharing stays as it was.
  }
  for (const l of listeners) l();
}

export function useShareListening(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getShareListening);
}
