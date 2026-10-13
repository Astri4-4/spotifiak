import { useSyncExternalStore } from "react";
import type { Child } from "@/types/subsonic";

// The song menu (right-click, or the "..." button on a song) and the short
// confirmations it shows, e.g. "Added to queue". One menu for the whole app,
// drawn by <SongMenu /> in the layout.

export interface SongMenuRequest {
  track: Child;
  /** Where to open it (viewport px): at the pointer, or under the "..." button. */
  x: number;
  y: number;
  /** Liked state as the list shows it, and its own toggle (otherwise the menu's own). */
  starred?: boolean;
  onToggleStar?: () => void;
  /** Offers "Remove from this playlist". */
  onRemoveFromPlaylist?: () => void;
}

interface State {
  menu: SongMenuRequest | null;
  toast: { id: number; text: string } | null;
}

let state: State = { menu: null, toast: null };
const listeners = new Set<() => void>();
let toastTimer: number | undefined;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function openSongMenu(request: SongMenuRequest) {
  set({ menu: request });
}

export function closeSongMenu() {
  if (state.menu) set({ menu: null });
}

/** Briefly shows `text` at the bottom of the screen. */
export function showToast(text: string) {
  window.clearTimeout(toastTimer);
  set({ toast: { id: Date.now(), text } });
  toastTimer = window.setTimeout(() => set({ toast: null }), 2500);
}

export function useSongMenuState(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
