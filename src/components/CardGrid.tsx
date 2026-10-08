import type { ReactNode } from "react";

/**
 * Fluid card grid: two columns on phones, then as many ~160px+ columns as fit.
 * Uses auto-fill rather than fixed breakpoints so the grid reflows smoothly
 * at any window width (and accounts for the sidebar eating horizontal space).
 */
export function CardGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-auto-fill-cards sm:gap-4">{children}</div>
  );
}
