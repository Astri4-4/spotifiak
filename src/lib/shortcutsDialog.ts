import { useSyncExternalStore } from "react";

// Whether the keyboard shortcuts list is shown ("?", or from Settings).

let open = false;
const listeners = new Set<() => void>();

export function setShortcutsOpen(value: boolean) {
  open = value;
  for (const l of listeners) l();
}

export function useShortcutsOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => open,
  );
}
