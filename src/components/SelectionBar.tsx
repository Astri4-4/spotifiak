import { useEffect, useState, type FormEvent } from "react";
import { createPlaylist, star, unstar, updatePlaylist } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { refreshPlaylists, usePlaylists } from "@/lib/playlists";
import { showToast } from "@/lib/songMenu";
import { setStarred } from "@/lib/trackStar";
import { CloseIcon, HeartIcon, PlayIcon, PlusIcon, QueueAddIcon } from "./icons";

const plural = (n: number) => `${n} song${n === 1 ? "" : "s"}`;

/**
 * What to do with the songs selected in a list: play them, queue them, like
 * them, add them to a playlist or remove them from this one. Floats above
 * the player while songs are selected.
 */
export function SelectionBar({
  tracks,
  allSelected,
  isStarred,
  onToggleStar,
  onRemove,
  onSelectAll,
  onClear,
}: {
  tracks: Child[];
  allSelected: boolean;
  isStarred: (track: Child) => boolean;
  /** The list's own like toggle (keeps its hearts right); else the server is told directly. */
  onToggleStar?: (track: Child) => void;
  /** Offers removing them from the playlist shown. */
  onRemove?: () => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const { playQueue, enqueue, inJam } = usePlayer();
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClear();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClear]);

  const count = tracks.length;
  const allStarred = tracks.every(isStarred);

  function done(toast: string) {
    showToast(toast);
    onClear();
  }

  async function toggleLikes() {
    const changing = tracks.filter((t) => isStarred(t) === allStarred);
    try {
      if (onToggleStar) changing.forEach(onToggleStar);
      else {
        await (allStarred ? unstar : star)({ id: changing.map((t) => t.id) });
        for (const t of changing) setStarred(t.id, !allStarred);
      }
      done(allStarred ? `Removed ${plural(count)} from Liked Songs` : `Added ${plural(changing.length)} to Liked Songs`);
    } catch {
      showToast("Couldn't change your likes");
    }
  }

  const button = "flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold hover:bg-white/10";
  return (
    <div className="fixed inset-x-0 bottom-[calc(var(--safe-bottom)+8.5rem)] z-40 flex justify-center px-2 md:bottom-28">
      <div className="relative flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-spotify-highlight-black px-2 py-1 shadow-2xl ring-1 ring-white/10">
        <span className="whitespace-nowrap px-2 text-sm font-bold">{count} selected</span>
        <button type="button" onClick={() => {
            playQueue(tracks);
            onClear();
          }} className={button} title="Play">
          <PlayIcon className="h-4 w-4 fill-current" />
          <span className="hidden sm:inline">Play</span>
        </button>
        <button
          type="button"
          onClick={() => {
            enqueue(tracks);
            done(inJam ? `Added ${plural(count)} to the Jam` : `Added ${plural(count)} to queue`);
          }}
          className={button}
          title={inJam ? "Add to Jam queue" : "Add to queue"}
        >
          <QueueAddIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Queue</span>
        </button>
        <button type="button" onClick={() => void toggleLikes()} className={button} title={allStarred ? "Remove from Liked Songs" : "Save to Liked Songs"}>
          <HeartIcon filled={allStarred} className={`h-4 w-4 ${allStarred ? "text-spotify-green" : ""}`} />
          <span className="hidden sm:inline">{allStarred ? "Unlike" : "Like"}</span>
        </button>
        <button type="button" onClick={() => setPicking((p) => !p)} className={button} title="Add to playlist" aria-expanded={picking}>
          <PlusIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Playlist</span>
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={() => {
              onRemove();
              done(`Removed ${plural(count)} from this playlist`);
            }}
            className={`${button} whitespace-nowrap`}
            title="Remove from this playlist"
          >
            <span className="block w-4 text-center leading-4">−</span>
            <span className="hidden sm:inline">Remove</span>
          </button>
        )}
        {!allSelected && (
          <button type="button" onClick={onSelectAll} className={`${button} whitespace-nowrap`}>
            All
          </button>
        )}
        <button type="button" onClick={onClear} aria-label="Cancel selection" title="Cancel (Esc)" className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-spotify-gray hover:bg-white/10 hover:text-white">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      {picking && <PlaylistPicker tracks={tracks} onDone={done} onClose={() => setPicking(false)} />}
    </div>
  );
}

function PlaylistPicker({ tracks, onDone, onClose }: { tracks: Child[]; onDone: (toast: string) => void; onClose: () => void }) {
  const { username } = useAuth();
  const playlists = usePlaylists();
  const [name, setName] = useState("");
  // Navidrome only lets the owner add songs to a playlist.
  const own = playlists?.filter((p) => !p.owner || p.owner === username);
  const ids = tracks.map((t) => t.id);

  async function addTo(playlistId: string, playlistName: string) {
    onClose();
    try {
      await updatePlaylist(playlistId, { songIdToAdd: ids });
      refreshPlaylists();
      onDone(`Added ${plural(ids.length)} to ${playlistName}`);
    } catch {
      showToast(`Couldn't add them to ${playlistName}`);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const created = await createPlaylist(name.trim());
      await addTo(created.id, created.name);
    } catch {
      showToast("Couldn't create the playlist");
    }
  }

  return (
    <div className="absolute bottom-full mb-2 max-h-[50vh] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-md bg-spotify-highlight-black p-1 shadow-2xl ring-1 ring-white/10">
      <form onSubmit={handleCreate} className="flex gap-2 p-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New playlist"
          className="min-w-0 flex-1 rounded-md border border-white/20 bg-transparent px-2 py-1.5 text-base outline-none focus:border-white md:text-sm"
        />
        <button type="submit" disabled={!name.trim()} className="rounded-full bg-white px-3 text-sm font-bold text-black disabled:opacity-40">
          Create
        </button>
      </form>
      {!own ? (
        <p className="px-3 py-2 text-sm text-spotify-gray">Loading...</p>
      ) : (
        own.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => void addTo(p.id, p.name)}
            className="block w-full truncate rounded-sm px-3 py-2 text-left text-sm hover:bg-white/10"
          >
            {p.name}
          </button>
        ))
      )}
    </div>
  );
}
