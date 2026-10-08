import { useEffect, useState } from "react";
import { getStarred2, star, unstar } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { HeartIcon, PlayIcon } from "@/components/icons";

export function LikedSongs() {
  const [songs, setSongs] = useState<Child[] | null>(null);
  const { playQueue } = usePlayer();

  function refresh() {
    getStarred2().then((r) => setSongs(r.song ?? []));
  }

  useEffect(refresh, []);

  if (songs === null) return <Loading />;

  const starredIds = new Set(songs.map((s) => s.id));

  async function handleToggleStar(track: Child) {
    // Unstarring here means removing it from this very list.
    setSongs((prev) => prev?.filter((s) => s.id !== track.id) ?? null);
    try {
      await unstar({ id: [track.id] });
    } catch {
      refresh();
    }
  }

  return (
    <div>
      <div className="flex flex-col items-center gap-6 pt-8 sm:flex-row sm:items-end">
        <div className="flex h-48 w-48 flex-shrink-0 items-center justify-center rounded bg-gradient-to-br from-indigo-700 to-blue-300 shadow-2xl sm:h-56 sm:w-56">
          <HeartIcon filled className="h-20 w-20 text-white" />
        </div>
        <div className="flex flex-col gap-2 text-center sm:text-left">
          <span className="text-xs font-semibold uppercase">Playlist</span>
          <h1 className="text-3xl font-black sm:text-5xl">Liked Songs</h1>
          <p className="text-sm text-spotify-gray">{songs.length} songs</p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-6">
        <button
          type="button"
          onClick={() => playQueue(songs)}
          disabled={songs.length === 0}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green text-black transition hover:scale-105 hover:bg-spotify-green-bright disabled:opacity-50"
          aria-label="Play liked songs"
        >
          <PlayIcon className="h-6 w-6 fill-current pl-1" />
        </button>
      </div>

      <div className="mt-8">
        {songs.length === 0 ? (
          <p className="text-spotify-gray">
            Songs you like will appear here. Tap the heart icon on any track to save it.
          </p>
        ) : (
          <TrackList tracks={songs} showAlbum showCover starredIds={starredIds} onToggleStar={handleToggleStar} />
        )}
      </div>
    </div>
  );
}
