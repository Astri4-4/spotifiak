import { useSyncExternalStore } from "react";

// Whether the Friend activity side panel is shown (on screens wide enough for it).

const STORAGE_KEY = "spotifion.friendsPanel";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "hidden";
  } catch {
    return true;
  }
}

let open = read();

export function setFriendsPanelOpen(value: boolean) {
  open = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? "shown" : "hidden");
  } catch {
    // Not remembered next time.
  }
  for (const l of listeners) l();
}

export function useFriendsPanelOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
  );
}
