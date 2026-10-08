import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { coverArtUrl, getAlbum, type AlbumWithSongsID3 } from "@/api/subsonic";
import { formatDurationLong } from "@/lib/format";
import { usePlayer } from "@/context/PlayerContext";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { PlayIcon } from "@/components/icons";

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
      <div className="flex flex-col items-center gap-6 pt-8 sm:flex-row sm:items-end">
        <img
          src={coverArtUrl(album.coverArt, 400)}
          alt=""
          className="h-48 w-48 flex-shrink-0 rounded object-cover shadow-2xl sm:h-56 sm:w-56"
        />
        <div className="flex min-w-0 flex-col gap-2 text-center sm:text-left">
          <span className="text-xs font-semibold uppercase">Album</span>
          <h1 className="truncate text-3xl font-black sm:text-5xl">{album.name}</h1>
          <p className="text-sm text-spotify-gray">
            <span className="font-semibold text-white">{album.artist}</span>
            {album.year ? ` · ${album.year}` : ""} · {songs.length} songs
            {album.duration ? `, ${formatDurationLong(album.duration)}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-6">
        <button
          type="button"
          onClick={() => playQueue(songs)}
          disabled={songs.length === 0}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green text-black transition hover:scale-105 hover:bg-spotify-green-bright disabled:opacity-50"
          aria-label="Play album"
        >
          <PlayIcon className="h-6 w-6 fill-current pl-1" />
        </button>
      </div>

      <div className="mt-8">
        <TrackList tracks={songs} showArtist={false} />
      </div>
    </div>
  );
}
