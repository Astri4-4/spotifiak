import type { ReactNode } from "react";

/**
 * Fluid card grid: two columns on phones, then as many ~160px+ columns as fit.
 * Uses auto-fill rather than fixed breakpoints so the grid reflows smoothly
 * at any window width (and accounts for the sidebar eating horizontal space).
 *
 * With `rowOnPhones`, phones get a single horizontally swipeable row instead
 * (like Spotify's home screen), so long sections don't make the page endless.
 */
export function CardGrid({ children, rowOnPhones }: { children: ReactNode; rowOnPhones?: boolean }) {
  if (rowOnPhones) {
    return (
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:grid sm:snap-none sm:grid-cols-auto-fill-cards sm:gap-4 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden [&>*]:w-36 [&>*]:flex-shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
        {children}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-auto-fill-cards sm:gap-4">{children}</div>
  );
}
