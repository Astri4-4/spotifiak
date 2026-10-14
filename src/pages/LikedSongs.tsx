import { useEffect, useState } from "react";
import { getStarred2, unstar } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { HeartIcon } from "@/components/icons";
import { DetailHeader, PlayButton } from "@/components/DetailHeader";
import { useHidden, visibleIndices } from "@/lib/hidden";

export function LikedSongs() {
  const [songs, setSongs] = useState<Child[] | null>(null);
  const { playQueue } = usePlayer();
  const hidden = useHidden();

  function refresh() {
    getStarred2().then((r) => setSongs(r.song ?? []));
  }

  useEffect(refresh, []);

  if (songs === null) return <Loading />;
  // Liking both copies of a song shows it once.
  const visible = visibleIndices(songs, hidden).map((i) => songs[i]);

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
      <DetailHeader
        kind="Playlist"
        title="Liked Songs"
        image={
          <div className="flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-indigo-700 to-blue-300">
            <HeartIcon filled className="h-1/3 w-1/3 text-pure-white" />
          </div>
        }
        meta={`${visible.length} songs`}
      />
      <div className="mt-4 flex items-center gap-6 sm:mt-6">
        <PlayButton onClick={() => playQueue(visible)} disabled={visible.length === 0} label="Play liked songs" />
      </div>

      <div className="mt-4 sm:mt-8">
        {songs.length === 0 ? (
          <p className="text-spotify-gray">
            Songs you like will appear here. Tap the heart icon on any track to save it.
          </p>
        ) : (
          <TrackList tracks={visible} showAlbum showCover starredIds={starredIds} onToggleStar={handleToggleStar} />
        )}
      </div>
    </div>
  );
}
