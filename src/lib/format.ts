/** Formats seconds as "m:ss" (or "h:mm:ss" past an hour), Spotify-style. */
export function formatDuration(totalSeconds: number | undefined | null): string {
  if (!totalSeconds || totalSeconds < 0 || Number.isNaN(totalSeconds)) return "0:00";
  const seconds = Math.floor(totalSeconds % 60);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/** Formats a track/album duration given in seconds as "X hr Y min" (for playlist/album headers). */
export function formatDurationLong(totalSeconds: number | undefined | null): string {
  if (!totalSeconds || totalSeconds < 0) return "";
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} hr ${minutes} min`;
  return `${minutes} min`;
}

/** How long ago a time (ms since epoch) was: "Just now", "5 min ago", "3 h ago", "2 days ago". */
export function formatTimeAgo(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
}

/**
 * A title reduced for comparing across sources (library, MusicBrainz, Deezer):
 * "Été (Deluxe Edition)" and "ete" match, and so do "Song (feat. X)" and "Song".
 */
export function titleKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s*[([].*?[)\]]/g, "")
    .replace(/\s+(feat|ft|featuring)\.?\s.*$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
