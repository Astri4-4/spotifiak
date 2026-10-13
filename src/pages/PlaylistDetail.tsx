import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  deletePlaylist,
  getPlaylist,
  coverArtUrl,
  setPlaylistSongs,
  star,
  unstar,
  updatePlaylist,
  type PlaylistWithSongs,
} from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { formatDurationLong } from "@/lib/format";
import { usePlayer } from "@/context/PlayerContext";
import { useAuth } from "@/context/AuthContext";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { DetailHeader, PlayButton, ShufflePlayButton } from "@/components/DetailHeader";
import { CloseIcon, DragHandleIcon } from "@/components/icons";
import { shuffled } from "@/lib/shuffle";
import { refreshPlaylists } from "@/lib/playlists";
import { useDragReorder } from "@/lib/useDragReorder";
import { RemoveDuplicatesButton } from "@/components/RemoveDuplicatesButton";

export function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<PlaylistWithSongs | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { playQueue } = usePlayer();
  const { username } = useAuth();
  const navigate = useNavigate();
  // Edits are saved one after the other, in the order they were made, since
  // Subsonic removes songs by position.
  const savingRef = useRef(Promise.resolve());

  function load(playlistId: string) {
    getPlaylist(playlistId).then((p) => {
      setPlaylist(p);
      setStarredIds(new Set(p.entry?.filter((s) => s.starred).map((s) => s.id)));
    });
  }

  useEffect(() => {
    if (!id) return;
    setPlaylist(null);
    setEditing(false);
    setSaveError(null);
    load(id);
  }, [id]);

  if (!playlist || !id) return <Loading />;

  const songs: Child[] = playlist.entry ?? [];
  // Navidrome only lets the owner change a playlist.
  const canEdit = !playlist.owner || playlist.owner === username;

  /** Shows `next` right away and saves it with `change`; reloads the server's version if that fails. */
  function edit(next: PlaylistWithSongs, change: () => Promise<void>) {
    const playlistId = id!;
    setPlaylist(next);
    setSaveError(null);
    savingRef.current = savingRef.current.then(change).catch(() => {
      setSaveError("Couldn't save that change. This is the playlist as it is now.");
      load(playlistId);
    });
  }

  function removeSong(index: number) {
    if (!playlist) return;
    const entry = songs.filter((_, i) => i !== index);
    edit({ ...playlist, entry, songCount: entry.length }, () =>
      updatePlaylist(id!, { songIndexToRemove: [index] }),
    );
  }

  function moveSong(from: number, to: number) {
    if (!playlist) return;
    const entry = [...songs];
    const [moved] = entry.splice(from, 1);
    entry.splice(to, 0, moved);
    edit({ ...playlist, entry }, () => setPlaylistSongs(id!, entry.map((s) => s.id)));
  }

  function saveDetails(name: string, comment: string) {
    if (!playlist) return;
    edit({ ...playlist, name, comment }, async () => {
      await updatePlaylist(id!, { name, comment });
      refreshPlaylists();
    });
  }

  async function handleToggleStar(track: Child) {
    const isStarred = starredIds.has(track.id);
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (isStarred) next.delete(track.id);
      else next.add(track.id);
      return next;
    });
    try {
      if (isStarred) await unstar({ id: [track.id] });
      else await star({ id: [track.id] });
    } catch {
      // revert on failure
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (isStarred) next.add(track.id);
        else next.delete(track.id);
        return next;
      });
    }
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirm(`Delete playlist "${playlist?.name}"? This can't be undone.`)) return;
    await deletePlaylist(id);
    refreshPlaylists();
    navigate("/", { replace: true });
  }

  return (
    <div>
      <DetailHeader
        kind="Playlist"
        title={playlist.name}
        image={<img src={coverArtUrl(playlist.coverArt, 400)} alt="" className="h-full w-full rounded object-cover" />}
        meta={
          <>
            {playlist.comment && <span className="mb-1 block">{playlist.comment}</span>}
            {songs.length} songs
            {playlist.duration ? ` · ${formatDurationLong(playlist.duration)}` : ""}
          </>
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 sm:mt-6">
        <PlayButton onClick={() => playQueue(songs)} disabled={songs.length === 0} label="Play playlist" />
        <ShufflePlayButton
          onClick={() => playQueue(shuffled(songs))}
          disabled={songs.length === 0}
          label="Shuffle playlist"
        />
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className={
              editing
                ? "rounded-full bg-white px-4 py-1.5 text-sm font-bold text-black hover:scale-105"
                : "text-sm font-semibold text-spotify-gray hover:text-white"
            }
          >
            {editing ? "Done" : "Edit playlist"}
          </button>
        )}
        <RemoveDuplicatesButton kind="playlist" id={id} onDone={() => load(id)} />
        <button
          type="button"
          onClick={handleDelete}
          className="text-sm font-semibold text-spotify-gray hover:text-white"
        >
          Delete playlist
        </button>
      </div>

      {saveError && <p className="mt-4 rounded-md bg-white/10 px-4 py-2 text-sm">{saveError}</p>}

      <div className="mt-4 sm:mt-8">
        {editing && (
          <DetailsForm
            // Reset the fields when another playlist is shown.
            key={playlist.id}
            name={playlist.name}
            comment={playlist.comment ?? ""}
            onSave={saveDetails}
          />
        )}
        {songs.length === 0 ? (
          <p className="text-spotify-gray">This playlist is empty. Add songs from an album or search.</p>
        ) : editing ? (
          <EditableSongs songs={songs} onRemove={removeSong} onMove={moveSong} />
        ) : (
          <TrackList
            tracks={songs}
            showAlbum
            showCover
            starredIds={starredIds}
            onToggleStar={handleToggleStar}
            onRemoveFromPlaylist={canEdit ? removeSong : undefined}
          />
        )}
      </div>
    </div>
  );
}

function DetailsForm({
  name: savedName,
  comment: savedComment,
  onSave,
}: {
  name: string;
  comment: string;
  onSave: (name: string, comment: string) => void;
}) {
  const [name, setName] = useState(savedName);
  const [comment, setComment] = useState(savedComment);
  const changed = name.trim() !== savedName || comment.trim() !== savedComment;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !changed) return;
    onSave(name.trim(), comment.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 flex max-w-xl flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="rounded-md border border-white/20 bg-transparent px-3 py-2 font-normal outline-none focus:border-white"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Description
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Add an optional description"
          className="resize-y rounded-md border border-white/20 bg-transparent px-3 py-2 font-normal outline-none focus:border-white"
        />
      </label>
      <button
        type="submit"
        disabled={!changed || !name.trim()}
        className="self-start rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
      >
        Save details
      </button>
    </form>
  );
}

/** The playlist's songs, to drag into a new order or remove. */
function EditableSongs({
  songs,
  onRemove,
  onMove,
}: {
  songs: Child[];
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const { itemProps, handleProps } = useDragReorder(onMove);
  return (
    <div className="flex flex-col">
      {songs.map((track, index) => (
        <div
          key={`${index}-${track.id}`}
          {...itemProps(index)}
          className="flex items-center gap-2 rounded-md p-2 hover:bg-white/10 data-[dragging]:bg-spotify-highlight-black data-[dragging]:shadow-xl"
        >
          <span
            {...handleProps(index)}
            aria-label={`Drag to move ${track.title}`}
            className="flex h-8 w-6 flex-shrink-0 items-center justify-center text-spotify-gray hover:text-white"
          >
            <DragHandleIcon className="h-4 w-4 fill-current" />
          </span>
          <img src={coverArtUrl(track.coverArt, 80)} alt="" className="h-10 w-10 flex-shrink-0 rounded object-cover" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{track.title}</span>
            <span className="block truncate text-sm text-spotify-gray">{track.artist}</span>
          </span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`Remove ${track.title} from the playlist`}
            title="Remove from playlist"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-spotify-gray hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
