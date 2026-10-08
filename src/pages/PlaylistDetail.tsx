import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deletePlaylist, getPlaylist, coverArtUrl, star, unstar, type PlaylistWithSongs } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { formatDurationLong } from "@/lib/format";
import { usePlayer } from "@/context/PlayerContext";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { DetailHeader, PlayButton } from "@/components/DetailHeader";

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
      <DetailHeader
        kind="Playlist"
        title={playlist.name}
        image={<img src={coverArtUrl(playlist.coverArt, 400)} alt="" className="h-full w-full rounded object-cover" />}
        meta={
          <>
            {songs.length} songs
            {playlist.duration ? ` · ${formatDurationLong(playlist.duration)}` : ""}
          </>
        }
      />
      <div className="mt-4 flex items-center gap-6 sm:mt-6">
        <PlayButton onClick={() => playQueue(songs)} disabled={songs.length === 0} label="Play playlist" />
        <button
          type="button"
          onClick={handleDelete}
          className="text-sm font-semibold text-spotify-gray hover:text-white"
        >
          Delete playlist
        </button>
      </div>

      <div className="mt-4 sm:mt-8">
        {songs.length === 0 ? (
          <p className="text-spotify-gray">This playlist is empty. Add songs from an album or search.</p>
        ) : (
          <TrackList tracks={songs} showAlbum showCover starredIds={starredIds} onToggleStar={handleToggleStar} />
        )}
      </div>
    </div>
  );
}
