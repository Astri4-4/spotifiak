import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deletePlaylist, getPlaylist, coverArtUrl, star, unstar, type PlaylistWithSongs } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { formatDurationLong } from "@/lib/format";
import { usePlayer } from "@/context/PlayerContext";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { PlayIcon } from "@/components/icons";

export function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<PlaylistWithSongs | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const { playQueue } = usePlayer();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) return;
    setPlaylist(null);
    getPlaylist(id).then((p) => {
      setPlaylist(p);
      setStarredIds(new Set(p.entry?.filter((s) => s.starred).map((s) => s.id)));
    });
  }, [id]);

  if (!playlist) return <Loading />;

  const songs: Child[] = playlist.entry ?? [];

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
    navigate("/", { replace: true });
  }

  return (
    <div>
      <div className="flex flex-col items-center gap-6 pt-8 sm:flex-row sm:items-end">
        <img
          src={coverArtUrl(playlist.coverArt, 400)}
          alt=""
          className="h-48 w-48 flex-shrink-0 rounded object-cover shadow-2xl sm:h-56 sm:w-56"
        />
        <div className="flex min-w-0 flex-col gap-2 text-center sm:text-left">
          <span className="text-xs font-semibold uppercase">Playlist</span>
          <h1 className="truncate text-3xl font-black sm:text-5xl">{playlist.name}</h1>
          <p className="text-sm text-spotify-gray">
            {songs.length} songs
            {playlist.duration ? ` · ${formatDurationLong(playlist.duration)}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-6">
        <button
          type="button"
          onClick={() => playQueue(songs)}
          disabled={songs.length === 0}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green text-black transition hover:scale-105 hover:bg-spotify-green-bright disabled:opacity-50"
          aria-label="Play playlist"
        >
          <PlayIcon className="h-6 w-6 fill-current pl-1" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="text-sm font-semibold text-spotify-gray hover:text-white"
        >
          Delete playlist
        </button>
      </div>

      <div className="mt-8">
        {songs.length === 0 ? (
          <p className="text-spotify-gray">This playlist is empty. Add songs from an album or search.</p>
        ) : (
          <TrackList tracks={songs} showAlbum showCover starredIds={starredIds} onToggleStar={handleToggleStar} />
        )}
      </div>
    </div>
  );
}
