import { useSyncExternalStore } from "react";

/** Tracks a CSS media query, e.g. useMediaQuery("(max-width: 639px)"). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Below Tailwind's `sm` breakpoint. */
export const PHONE_QUERY = "(max-width: 639px)";
