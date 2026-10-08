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
