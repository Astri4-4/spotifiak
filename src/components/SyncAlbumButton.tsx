import { useEffect, useState } from "react";
import { isDownloadDone } from "@/api/discover";
import { downloadTracks, findAlbumGaps, findDownload, useDiscoverConfig, useDownloads, type AlbumGaps } from "@/lib/discover";
import type { AlbumWithSongsID3 } from "@/types/subsonic";

/** After the downloads, give Navidrome's scan a moment before reloading the album. */
const RELOAD_DELAY_MS = 8000;

/**
 * Shown when the album lacks songs it has on Deezer: downloads the missing
 * ones (through Discover), then reloads the album with `onSynced`.
 */
export function SyncAlbumButton({ album, onSynced }: { album: AlbumWithSongsID3; onSynced: () => void }) {
  const available = useDiscoverConfig()?.available ?? false;
  const list = useDownloads();
  const [gaps, setGaps] = useState<AlbumGaps | null>(null);
  const [busy, setBusy] = useState(false);
  /** Deezer ids of the tracks being downloaded. */
  const [syncing, setSyncing] = useState<string[] | null>(null);

  useEffect(() => {
    setGaps(null);
    if (!available) return;
    let cancelled = false;
    findAlbumGaps(album)
      .then((g) => !cancelled && setGaps(g))
      .catch(() => void 0); // Deezer or deemix unreachable: no button, that's all.
    return () => {
      cancelled = true;
    };
  }, [available, album]);

  // Downloads that couldn't start don't hold the rest up.
  const pending = syncing
    ? syncing.filter((id) => {
        const d = findDownload(list, "track", id);
        return d && !isDownloadDone(d);
      }).length
    : 0;

  useEffect(() => {
    if (!syncing || pending > 0) return;
    const timer = window.setTimeout(() => {
      setSyncing(null);
      onSynced();
    }, RELOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [syncing, pending, onSynced]);

  const missing = gaps?.missing ?? [];
  if (!syncing && missing.length === 0) return null;

  async function sync() {
    const ids = missing.map((t) => t.id);
    setBusy(true);
    await downloadTracks(ids, `${ids.length} song${ids.length === 1 ? "" : "s"} of ${album.name}`);
    setBusy(false);
    setSyncing(ids);
  }

  const n = syncing?.length ?? missing.length;
  return (
    <button
      type="button"
      onClick={() => void sync()}
      disabled={busy || syncing !== null}
      title={syncing ? undefined : `Missing from Deezer's album:\n${missing.map((t) => `${t.track}. ${t.title}`).join("\n")}`}
      className="text-sm font-semibold text-spotify-green hover:text-white disabled:text-spotify-gray"
    >
      {syncing
        ? pending > 0
          ? `Syncing ${n - pending}/${n}...`
          : "Adding to the library..."
        : `Sync: ${n} missing song${n === 1 ? "" : "s"}`}
    </button>
  );
}
