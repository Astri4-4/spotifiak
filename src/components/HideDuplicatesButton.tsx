import { useState } from "react";
import type { Child } from "@/types/subsonic";
import { jamBase } from "@/lib/servers";
import {
  findDuplicates,
  hideDuplicates,
  showHiddenAgain,
  useHidden,
  visibleIndices,
  type DuplicateGroup,
} from "@/lib/hidden";
import { showToast } from "@/lib/songMenu";

type Step =
  | { kind: "idle" }
  | { kind: "finding"; done: number; total: number }
  | { kind: "review"; scope: Child[]; groups: DuplicateGroup[]; albums: { id: string; name: string }[] }
  | { kind: "saving" }
  | { kind: "error"; message: string };

/**
 * "Hide duplicates" for an album, artist or playlist: finds the other copies
 * of its songs in the library and, once confirmed, hides all but the best
 * one, for you only. Nothing changes in the library, so no one's playlists
 * break. Also shows the copies hidden here again.
 */
export function HideDuplicatesButton({
  what,
  songs,
  albumIds = [],
}: {
  /** "album", "artist" or "playlist", for the texts. */
  what: string;
  /** Its songs (loaded on demand, e.g. an artist's). */
  songs: () => Child[] | Promise<Child[]>;
  /** Its albums, which may be hidden themselves (an album's own id, an artist's albums). */
  albumIds?: string[];
}) {
  const hidden = useHidden();
  const [step, setStep] = useState<Step>({ kind: "idle" });

  if (jamBase() === null) return null;

  async function find() {
    setStep({ kind: "finding", done: 0, total: 0 });
    try {
      const scope = await songs();
      const { groups, albums } = await findDuplicates(scope, (done, total) => setStep({ kind: "finding", done, total }));
      setStep({ kind: "review", scope, groups, albums });
    } catch (err) {
      setStep({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function apply(groups: DuplicateGroup[], albums: string[]) {
    const count = groups.reduce((n, g) => n + g.hide.length, 0);
    setStep({ kind: "saving" });
    try {
      await hideDuplicates(groups, albums);
      setStep({ kind: "idle" });
      showToast(`Hid ${count} duplicate${count === 1 ? "" : "s"}. Only you see the difference.`);
    } catch (err) {
      setStep({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function showAgain(songIds: string[], albums: string[]) {
    setStep({ kind: "saving" });
    try {
      await showHiddenAgain({ songs: songIds, albums });
      setStep({ kind: "idle" });
      showToast("The hidden copies are back");
    } catch (err) {
      setStep({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  const close = () => setStep({ kind: "idle" });

  // What's hidden here now: the copies this list doesn't show, and its hidden albums.
  let hiddenSongs: string[] = [];
  let hiddenAlbums: string[] = [];
  if (step.kind === "review") {
    const shown = new Set(visibleIndices(step.scope, hidden).map((i) => step.scope[i].id));
    hiddenSongs = [...new Set(step.scope.filter((s) => hidden.songs[s.id] && !shown.has(s.id)).map((s) => s.id))];
    hiddenAlbums = albumIds.filter((id) => hidden.albums.includes(id));
  }
  // Already hidden copies don't need hiding again.
  const groups =
    step.kind === "review"
      ? step.groups
          .map((g) => ({ ...g, hide: g.hide.filter((s) => hidden.songs[s.id] !== g.keep.id) }))
          .filter((g) => g.hide.length)
      : [];
  const albums = step.kind === "review" ? step.albums.filter((a) => !hidden.albums.includes(a.id)) : [];
  const count = groups.reduce((n, g) => n + g.hide.length, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => void find()}
        disabled={step.kind === "finding"}
        className="text-sm font-semibold text-spotify-gray hover:text-white disabled:opacity-50"
      >
        {step.kind === "finding"
          ? `Looking for duplicates${step.total ? ` (${step.done}/${step.total})` : ""}...`
          : "Hide duplicates"}
      </button>

      {(step.kind === "review" || step.kind === "saving" || step.kind === "error") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={step.kind === "saving" ? undefined : close}>
          <div
            role="dialog"
            aria-label="Hide duplicates"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-lg flex-col rounded-lg bg-spotify-highlight-black p-6 shadow-2xl"
          >
            <h2 className="mb-2 text-lg font-bold">Hide duplicates</h2>
            {step.kind === "error" && <p className="text-sm text-red-400">{step.message}</p>}
            {step.kind === "saving" && <p className="text-sm text-spotify-gray">Saving...</p>}
            {step.kind === "review" &&
              (count === 0 && albums.length === 0 ? (
                <p className="text-sm text-spotify-gray">
                  {hiddenSongs.length || hiddenAlbums.length
                    ? "No other duplicates here."
                    : `No duplicates: every song of this ${what} is in your library once.`}
                </p>
              ) : (
                <>
                  <p className="mb-3 text-sm text-spotify-gray">
                    {groups.length} song{groups.length === 1 ? " is" : "s are"} in your library several times. The best copy
                    stays (an album's track over a single, then the best quality); the {count === 1 ? "other" : `${count} others`}{" "}
                    won't show wherever it's listed too. Only for you: the files and everyone's playlists stay as they are.
                  </p>
                  <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto px-2 text-sm">
                    {groups.map((g) => (
                      <li key={g.keep.id} className="border-t border-white/10 py-2">
                        <p className="truncate font-semibold">
                          {g.keep.title} <span className="font-normal text-spotify-gray">· {g.keep.artist}</span>
                        </p>
                        <p className="truncate text-spotify-green">Keep: {g.keep.album ?? "Unknown album"}</p>
                        {g.hide.map((s) => (
                          <p key={s.id} className="truncate text-spotify-gray">
                            Hide: {s.album ?? "Unknown album"}
                          </p>
                        ))}
                      </li>
                    ))}
                    {albums.length > 0 && (
                      <li className="border-t border-white/10 py-2">
                        <p className="font-semibold">Albums left with only hidden songs, hidden from artist pages and search:</p>
                        {albums.map((a) => (
                          <p key={a.id} className="truncate text-spotify-gray">
                            {a.name}
                          </p>
                        ))}
                      </li>
                    )}
                  </ul>
                </>
              ))}
            {step.kind === "review" && (hiddenSongs.length > 0 || hiddenAlbums.length > 0) && (
              <p className="mt-3 text-sm text-spotify-gray">
                {[
                  hiddenSongs.length && `${hiddenSongs.length} cop${hiddenSongs.length === 1 ? "y" : "ies"}`,
                  hiddenAlbums.length && `${hiddenAlbums.length === 1 && what === "album" ? "this album" : `${hiddenAlbums.length} album${hiddenAlbums.length === 1 ? "" : "s"}`}`,
                ]
                  .filter(Boolean)
                  .join(" and ")}{" "}
                hidden here.{" "}
                <button
                  type="button"
                  onClick={() => void showAgain(hiddenSongs, hiddenAlbums)}
                  className="font-semibold text-white underline-offset-2 hover:underline"
                >
                  Show again
                </button>
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={close}
                disabled={step.kind === "saving"}
                className="rounded-full px-4 py-2 text-sm font-semibold text-spotify-gray hover:text-white disabled:opacity-40"
              >
                {step.kind === "review" && (count > 0 || albums.length > 0) ? "Cancel" : "Close"}
              </button>
              {step.kind === "review" && (count > 0 || albums.length > 0) && (
                <button
                  type="button"
                  onClick={() => void apply(groups, albums.map((a) => a.id))}
                  className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:scale-105"
                >
                  {count ? `Hide ${count} cop${count === 1 ? "y" : "ies"}` : "Hide"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
