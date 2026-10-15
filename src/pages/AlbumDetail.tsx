import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { coverArtUrl, getAlbum, type AlbumWithSongsID3 } from "@/api/subsonic";
import { formatDurationLong } from "@/lib/format";
import { usePlayer } from "@/context/PlayerContext";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { DetailHeader, PlayButton, ShufflePlayButton } from "@/components/DetailHeader";
import { shuffled } from "@/lib/shuffle";
import { HideDuplicatesButton } from "@/components/HideDuplicatesButton";
import { SyncAlbumButton } from "@/components/SyncAlbumButton";
import { LikeCollectionButton } from "@/components/LikeCollectionButton";
import { useVisibleSongs } from "@/lib/hidden";
import type { Child } from "@/types/subsonic";

const NO_SONGS: Child[] = [];

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const [album, setAlbum] = useState<AlbumWithSongsID3 | null>(null);
  const { playQueue } = usePlayer();
  const songs = useVisibleSongs(album?.song ?? NO_SONGS);

  useEffect(() => {
    if (!id) return;
    setAlbum(null);
    getAlbum(id).then(setAlbum);
  }, [id]);

  // After syncing missing songs: show them (without the loading screen).
  const reload = useCallback(() => {
    if (id) getAlbum(id).then(setAlbum);
  }, [id]);

  if (!album) return <Loading />;

  return (
    <div>
      <DetailHeader
        kind="Album"
        title={album.name}
        image={<img src={coverArtUrl(album.coverArt, 400)} alt="" className="h-full w-full rounded object-cover" />}
        meta={
          <>
            {album.artistId ? (
              <Link to={`/artist/${album.artistId}`} className="font-semibold text-white hover:underline">
                {album.artist}
              </Link>
            ) : (
              <span className="font-semibold text-white">{album.artist}</span>
            )}
            {album.year ? ` · ${album.year}` : ""} · {songs.length} songs
            {album.duration ? `, ${formatDurationLong(album.duration)}` : ""}
          </>
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 sm:mt-6">
        <PlayButton onClick={() => playQueue(songs)} disabled={songs.length === 0} label="Play album" />
        <ShufflePlayButton
          onClick={() => playQueue(shuffled(songs))}
          disabled={songs.length === 0}
          label="Shuffle album"
        />
        <LikeCollectionButton kind="album" id={album.id} name={album.name} starred={album.starred} />
        <HideDuplicatesButton what="album" songs={() => album.song ?? []} albumIds={[album.id]} />
        <SyncAlbumButton album={album} onSynced={reload} />
      </div>

      <div className="mt-4 sm:mt-8">
        <TrackList tracks={songs} showArtist={false} />
      </div>
    </div>
  );
}
