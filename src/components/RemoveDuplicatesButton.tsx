import { useEffect, useState } from "react";
import { getPlaylist, getPlaylists, setPlaylistSongs, startScan } from "@/api/subsonic";
import {
  duplicatesAvailable,
  findDuplicates,
  removeDuplicates,
  type DuplicateGroup,
  type DuplicatesKind,
} from "@/api/duplicates";
import { useAuth } from "@/context/AuthContext";
import { refreshPlaylists } from "@/lib/playlists";
import { showToast } from "@/lib/songMenu";

let available: Promise<boolean> | null = null;

type Step =
  | { kind: "idle" }
  | { kind: "finding" }
  | { kind: "review"; groups: DuplicateGroup[] }
  | { kind: "removing" }
  | { kind: "error"; message: string };

/**
 * "Remove duplicates" for an album or playlist: finds the other files of its
 * songs in the library, shows which copy stays and which go to the trash,
 * and moves them once confirmed. Hidden when the server can't change files.
 */
export function RemoveDuplicatesButton({
  kind,
  id,
  onDone,
}: {
  kind: DuplicatesKind;
  id: string;
  /** After files were moved, e.g. to reload the page. */
  onDone?: () => void;
}) {
  const { username } = useAuth();
  const [canRemove, setCanRemove] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "idle" });

  useEffect(() => {
    available ??= duplicatesAvailable();
    void available.then(setCanRemove);
  }, []);

  if (!canRemove) return null;

  async function find() {
    setStep({ kind: "finding" });
    try {
      setStep({ kind: "review", groups: await findDuplicates(kind, id) });
    } catch (err) {
      setStep({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function remove() {
    setStep({ kind: "removing" });
    try {
      const result = await removeDuplicates(kind, id);
      const kept = new Map(result.groups.flatMap((g) => g.remove.map((r) => [r.id, g.keep.id] as const)));
      const repointed = await repointPlaylists(kept, username);
      // Navidrome notices by itself within its scan schedule; a scan (admins) is sooner.
      startScan().catch(() => void 0);
      setStep({ kind: "idle" });
      const failed = result.failed.length ? ` ${result.failed.length} couldn't be moved.` : "";
      const playlists = repointed ? ` ${repointed} of your playlists now use the copies kept.` : "";
      showToast(`Moved ${result.moved} duplicate file${result.moved === 1 ? "" : "s"} to the trash.${failed}${playlists}`);
      onDone?.();
    } catch (err) {
      setStep({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const close = () => setStep({ kind: "idle" });
  const fileCount = step.kind === "review" ? step.groups.reduce((n, g) => n + g.remove.length, 0) : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => void find()}
        disabled={step.kind === "finding"}
        className="text-sm font-semibold text-spotify-gray hover:text-white disabled:opacity-50"
      >
        {step.kind === "finding" ? "Looking for duplicates..." : "Remove duplicates"}
      </button>

      {(step.kind === "review" || step.kind === "removing" || step.kind === "error") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={step.kind === "removing" ? undefined : close}>
          <div
            role="dialog"
            aria-label="Remove duplicates"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-lg flex-col rounded-lg bg-spotify-highlight-black p-6 shadow-2xl"
          >
            <h2 className="mb-2 text-lg font-bold">Remove duplicates</h2>
            {step.kind === "error" && <p className="text-sm text-red-400">{step.message}</p>}
            {step.kind === "removing" && <p className="text-sm text-spotify-gray">Moving files...</p>}
            {step.kind === "review" &&
              (step.groups.length === 0 ? (
                <p className="text-sm text-spotify-gray">No duplicates: every song here has a single file.</p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-spotify-gray">
                    {step.groups.length} song{step.groups.length === 1 ? " has" : "s have"} several files. The best copy stays
                    (album track, then single, then a playlist folder's); {fileCount} other file{fileCount === 1 ? "" : "s"} will
                    be moved to the music folder's hidden trash (<code>.spotifion-trash</code>), for everyone. Nothing is deleted.
                  </p>
                  <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 text-sm">
                    {step.groups.map((g) => (
                      <li key={g.keep.id} className="border-t border-white/10 py-2">
                        <p className="truncate font-semibold">
                          {g.title} <span className="font-normal text-spotify-gray">· {g.artist}</span>
                        </p>
                        <p className="truncate text-spotify-green" title={g.keep.path}>
                          Keep: {g.keep.path}
                        </p>
                        {g.remove.map((r) => (
                          <p key={r.id} className="truncate text-spotify-gray" title={r.path}>
                            Trash: {r.path}
                          </p>
                        ))}
                      </li>
                    ))}
                  </ul>
                </>
              ))}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                disabled={step.kind === "removing"}
                className="rounded-full px-4 py-2 text-sm font-semibold text-spotify-gray hover:text-white disabled:opacity-40"
              >
                {step.kind === "review" && step.groups.length > 0 ? "Cancel" : "Close"}
              </button>
              {step.kind === "review" && step.groups.length > 0 && (
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:scale-105"
                >
                  Move {fileCount} file{fileCount === 1 ? "" : "s"} to trash
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Points the caller's own playlists at the copies kept (Navidrome only lets
 * owners change a playlist), without adding a song twice where both copies
 * were in it. Returns how many changed.
 */
async function repointPlaylists(kept: Map<string, string>, username: string | null): Promise<number> {
  if (kept.size === 0) return 0;
  const own = (await getPlaylists()).filter((p) => !p.owner || p.owner === username);
  let changed = 0;
  for (const summary of own) {
    try {
      const entries = (await getPlaylist(summary.id)).entry ?? [];
      if (!entries.some((e) => kept.has(e.id))) continue;
      const ids: string[] = [];
      for (const e of entries) {
        const id = kept.get(e.id) ?? e.id;
        if (id !== e.id && ids.includes(id)) continue;
        ids.push(id);
      }
      await setPlaylistSongs(summary.id, ids);
      changed++;
    } catch {
      // That playlist keeps pointing at the old file; the others still get fixed.
    }
  }
  if (changed) refreshPlaylists();
  return changed;
}
