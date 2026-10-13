import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { coverArtUrl, getAlbum, type AlbumWithSongsID3 } from "@/api/subsonic";
import { formatDurationLong } from "@/lib/format";
import { usePlayer } from "@/context/PlayerContext";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { DetailHeader, PlayButton, ShufflePlayButton } from "@/components/DetailHeader";
import { shuffled } from "@/lib/shuffle";
import { RemoveDuplicatesButton } from "@/components/RemoveDuplicatesButton";

export function AlbumDetail() {
  const { id } = useParams<{ id: string }>();
  const [album, setAlbum] = useState<AlbumWithSongsID3 | null>(null);
  const { playQueue } = usePlayer();

  useEffect(() => {
    if (!id) return;
    setAlbum(null);
    getAlbum(id).then(setAlbum);
  }, [id]);

  if (!album) return <Loading />;

  const songs = album.song ?? [];

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
        <RemoveDuplicatesButton kind="album" id={album.id} onDone={() => getAlbum(album.id).then(setAlbum)} />
      </div>

      <div className="mt-4 sm:mt-8">
        <TrackList tracks={songs} showArtist={false} />
      </div>
    </div>
  );
}
