import { useCallback, useEffect, useRef, useState } from "react";

/** Rows drawn at first, and added each time you scroll near the end. */
export const STEP = 50;
/** How far ahead of the end the next rows are drawn. */
const AHEAD_PX = 800;

/** The element that scrolls `el` (the page's main area), or null for the window. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === "auto" || overflowY === "scroll") return p;
  }
  return null;
}

/**
 * Draws a long list a step at a time (a 2,000-song playlist would take
 * seconds to draw at once): how many of `total` items to draw, and a ref for
 * an element after them that draws the next step when it scrolls into view.
 */
export function useStepped(total: number, step = STEP) {
  const [count, setCount] = useState(step);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const more = total > count;

  const sentinelRef = useCallback(
    (el: HTMLElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!el || !more) return;
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) setCount((c) => c + step);
        },
        { root: scrollParent(el), rootMargin: `${AHEAD_PX}px 0px` },
      );
      observer.observe(el);
      observerRef.current = observer;
    },
    // A new observer after each step: one already in view fires again at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [more, step, count],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { count: Math.min(count, total), more, sentinelRef };
}
