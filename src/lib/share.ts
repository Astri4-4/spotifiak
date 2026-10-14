import { jamInviteOrigin } from "./servers";

// Links to a song, to send to someone else on the same Navidrome server.
// They open in the web app: the desktop and mobile apps' own address isn't
// reachable by others.

/** The web app's address, looked up ahead of time: Safari only lets a click copy right away, not after waiting. */
let origin: string | null = null;
function refreshOrigin() {
  void jamInviteOrigin()
    .then((o) => (origin = o))
    .catch(() => void 0);
}
refreshOrigin();

/** The link to a song, or null if there's no web app to point at (a mobile app without a Jam server set). */
export function songLink(songId: string, sharedBy: string | null): string | null {
  if (!origin) return null;
  const query = sharedBy ? `?from=${encodeURIComponent(sharedBy)}` : "";
  return `${origin}/track/${encodeURIComponent(songId)}${query}`;
}

/** Copies the song's link; resolves to whether it worked. Call it straight from the click. */
export async function copySongLink(songId: string, sharedBy: string | null): Promise<boolean> {
  const link = songLink(songId, sharedBy);
  // In case the servers were changed in Settings since.
  refreshOrigin();
  if (!link) return false;
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    // The clipboard needs a secure context (https) and focus.
    return false;
  }
}
