import { useEffect, useState } from "react";
import { getStarred2, unstar } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { HeartIcon } from "@/components/icons";
import { DetailHeader, PlayButton, ShufflePlayButton } from "@/components/DetailHeader";
import { ListControls } from "@/components/ListControls";
import { byText, songFields, SONG_SORTS, sortedIndices, useSortChoice, type SortOption } from "@/lib/listSort";
import { shuffled } from "@/lib/shuffle";
import { useHidden, visibleIndices } from "@/lib/hidden";

const LIKED_SORTS: SortOption<Child>[] = [
  { id: "liked", label: "Recently liked", compare: (a, b) => byText(b.starred, a.starred) },
  ...SONG_SORTS.filter((o) => o.compare),
];

export function LikedSongs() {
  const [songs, setSongs] = useState<Child[] | null>(null);
  const { playQueue } = usePlayer();
  const hidden = useHidden();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useSortChoice("liked", LIKED_SORTS);

  function refresh() {
    getStarred2().then((r) => setSongs(r.song ?? []));
  }

  useEffect(refresh, []);

  if (songs === null) return <Loading />;
  // Liking both copies of a song shows it once.
  const visible = visibleIndices(songs, hidden).map((i) => songs[i]);
  const listed = sortedIndices(visible, sort, query, songFields).map((i) => visible[i]);

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
        <PlayButton onClick={() => playQueue(listed)} disabled={listed.length === 0} label="Play liked songs" />
        <ShufflePlayButton onClick={() => playQueue(shuffled(listed))} disabled={listed.length === 0} label="Shuffle liked songs" />
      </div>

      <div className="mt-4 sm:mt-8">
        {songs.length === 0 ? (
          <p className="text-spotify-gray">
            Songs you like will appear here. Tap the heart icon on any track to save it.
          </p>
        ) : (
          <>
            <div className="mb-4">
              <ListControls query={query} onQuery={setQuery} placeholder="Search in Liked Songs" sort={sort} sorts={LIKED_SORTS} onSort={setSort} />
            </div>
            {query && listed.length === 0 && <p className="text-spotify-gray">No liked song matches &ldquo;{query}&rdquo;.</p>}
            <TrackList tracks={listed} showAlbum showCover starredIds={starredIds} onToggleStar={handleToggleStar} />
          </>
        )}
      </div>
    </div>
  );
}
