import { useEffect, useState } from "react";
import { getScoreboard, type Scoreboard } from "@/api/scoreboard";

const POLL_MS = 60_000;

export type ScoreboardResult = { board: Scoreboard } | { error: string } | null;

/** This week's scoreboard, refreshed while the page is visible. null until the first answer. */
export function useScoreboard(): ScoreboardResult {
  const [result, setResult] = useState<ScoreboardResult>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function refresh() {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") {
        try {
          const board = await getScoreboard();
          if (!cancelled) setResult({ board });
        } catch (err) {
          // Keep showing the last board if a refresh fails.
          if (!cancelled) setResult((r) => (r && "board" in r ? r : { error: (err as Error).message }));
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
  }, []);

  return result;
}
