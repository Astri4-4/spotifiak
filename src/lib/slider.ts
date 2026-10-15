import type { CSSProperties } from "react";

/** Style for a `.spotify-slider`, filling its track up to `value` (see index.css). */
export function sliderFill(value: number, max: number): CSSProperties {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return { "--fill": `${percent}%` } as CSSProperties;
}
