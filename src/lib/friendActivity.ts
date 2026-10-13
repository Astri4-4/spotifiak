import { useEffect, useState } from "react";
import { getNowPlaying } from "@/api/subsonic";
import { useAuth } from "@/context/AuthContext";
import type { NowPlayingEntry } from "@/types/subsonic";

const POLL_MS = 30_000;

/**
 * What the other users of the Navidrome server are playing, refreshed while
 * the page is visible: one entry per user (their latest song), most recent
 * first. null until the first answer.
 */
export function useFriendActivity(): NowPlayingEntry[] | null {
  const { username } = useAuth();
  const [entries, setEntries] = useState<NowPlayingEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function refresh() {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") {
        try {
          const latest = new Map<string, NowPlayingEntry>();
          for (const entry of await getNowPlaying()) {
            if (entry.username === username) continue;
            const seen = latest.get(entry.username);
            if (!seen || entry.minutesAgo < seen.minutesAgo) latest.set(entry.username, entry);
          }
          if (!cancelled) setEntries([...latest.values()].sort((a, b) => a.minutesAgo - b.minutesAgo));
        } catch {
          if (!cancelled) setEntries((e) => e ?? []);
        }
      }
      if (!cancelled) timer = window.setTimeout(refresh, POLL_MS);
    }

    void refresh();
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [username]);

  return entries;
}
