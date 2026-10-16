import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { DetailHeader, PlayButton, ShufflePlayButton } from "@/components/DetailHeader";
import { CloseIcon, DragHandleIcon } from "@/components/icons";
import { shuffled } from "@/lib/shuffle";
import { isOwnPlaylist, refreshPlaylists } from "@/lib/playlists";
import { setStarred } from "@/lib/trackStar";
import { useDragReorder } from "@/lib/useDragReorder";
import { useStepped } from "@/lib/useStepped";
import { HideDuplicatesButton } from "@/components/HideDuplicatesButton";
import { useHidden, visibleIndices } from "@/lib/hidden";
import { ListControls } from "@/components/ListControls";
import { SONG_SORTS, songFields, sortedIndices, useSortChoice } from "@/lib/listSort";

const NO_SONGS: Child[] = [];

export function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<PlaylistWithSongs | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { playQueue } = usePlayer();
  const navigate = useNavigate();
  // Edits are saved one after the other, in the order they were made, since
  // Subsonic removes songs by position.
  const savingRef = useRef(Promise.resolve());
  const hidden = useHidden();
  const songs: Child[] = playlist?.entry ?? NO_SONGS;
  // Hidden duplicates aren't shown (but stay in the playlist: editing shows everything).
  const shown = useMemo(() => visibleIndices(songs, hidden), [songs, hidden]);
  const visible = useMemo(() => shown.map((i) => songs[i]), [shown, songs]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useSortChoice("playlist", SONG_SORTS);
  // What's listed, as positions in the playlist: found by the search, in the chosen order.
  const order = useMemo(
    () => sortedIndices(visible, sort, query, songFields).map((i) => shown[i]),
    [visible, sort, query, shown],
  );
  const listed = useMemo(() => order.map((i) => songs[i]), [order, songs]);

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
    setQuery("");
    load(id);
  }, [id]);

  if (!playlist || !id) return <Loading />;
  // Navidrome only lets the owner change a playlist.
  const canEdit = isOwnPlaylist(playlist);

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

  function removeSongs(indices: number[]) {
    if (!playlist || !indices.length) return;
    const gone = new Set(indices);
    const entry = songs.filter((_, i) => !gone.has(i));
    edit({ ...playlist, entry, songCount: entry.length }, () =>
      updatePlaylist(id!, { songIndexToRemove: [...gone] }),
    );
  }

  const removeSong = (index: number) => removeSongs([index]);

  function moveSong(from: number, to: number) {
    if (!playlist) return;
    const entry = [...songs];
    const [moved] = entry.splice(from, 1);
    entry.splice(to, 0, moved);
    edit({ ...playlist, entry }, () => setPlaylistSongs(id!, entry.map((s) => s.id)));
  }

  function setPublic(isPublic: boolean) {
    if (!playlist) return;
    edit({ ...playlist, public: isPublic }, async () => {
      await updatePlaylist(id!, { public: isPublic });
      refreshPlaylists();
    });
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
    setStarred(track.id, !isStarred);
    try {
      if (isStarred) await unstar({ id: [track.id] });
      else await star({ id: [track.id] });
    } catch {
      // revert on failure
      setStarred(track.id, isStarred);
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
        kind={playlist.public ? "Public playlist" : "Private playlist"}
        title={playlist.name}
        image={<img src={coverArtUrl(playlist.coverArt, 400)} alt="" className="h-full w-full rounded object-cover" />}
        meta={
          <>
            {playlist.comment && <span className="mb-1 block">{playlist.comment}</span>}
            {visible.length} songs
            {playlist.duration ? ` · ${formatDurationLong(playlist.duration)}` : ""}
          </>
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 sm:mt-6">
        <PlayButton onClick={() => playQueue(listed)} disabled={listed.length === 0} label="Play playlist" />
        <ShufflePlayButton
          onClick={() => playQueue(shuffled(listed))}
          disabled={listed.length === 0}
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
        <HideDuplicatesButton what="playlist" songs={() => songs} />
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
        {editing && <PublicSwitch isPublic={Boolean(playlist.public)} onChange={setPublic} />}
        {songs.length === 0 ? (
          <p className="text-spotify-gray">This playlist is empty. Add songs from an album or search.</p>
        ) : editing ? (
          <EditableSongs songs={songs} onRemove={removeSong} onMove={moveSong} />
        ) : (
          <>
            {/* Only worth it past a screenful. */}
            {visible.length > 10 && (
              <div className="mb-4">
                <ListControls
                  query={query}
                  onQuery={setQuery}
                  placeholder="Search in playlist"
                  sort={sort}
                  sorts={SONG_SORTS}
                  onSort={setSort}
                />
              </div>
            )}
            {query && listed.length === 0 && (
              <p className="text-spotify-gray">Nothing in this playlist matches &ldquo;{query}&rdquo;.</p>
            )}
            <TrackList
              tracks={listed}
              showAlbum
              showCover
              starredIds={starredIds}
              onToggleStar={handleToggleStar}
              onRemoveFromPlaylist={canEdit ? (i) => removeSong(order[i]) : undefined}
              onRemoveManyFromPlaylist={canEdit ? (list) => removeSongs(list.map((i) => order[i])) : undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}

/** Whether others on the server can see the playlist (and play it from any Subsonic app). */
function PublicSwitch({ isPublic, onChange }: { isPublic: boolean; onChange: (isPublic: boolean) => void }) {
  return (
    <label className="mb-6 flex max-w-xl cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Public</span>
        <span className="block text-xs text-spotify-gray">
          {isPublic
            ? "Others on this server can see it in Navidrome and other Subsonic apps, and open it from a link."
            : "Only you can see it (and the server's admins, in Navidrome)."}
        </span>
      </span>
      <input type="checkbox" role="switch" checked={isPublic} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="relative h-6 w-11 flex-shrink-0 rounded-full bg-white/30 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-pure-white after:shadow after:transition peer-checked:bg-spotify-green peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-white"
      />
    </label>
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
  const { count, more, sentinelRef } = useStepped(songs.length);
  return (
    <div className="flex flex-col">
      {songs.slice(0, count).map((track, index) => (
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
      {more && <div ref={sentinelRef} aria-hidden className="h-px" />}
    </div>
  );
}
