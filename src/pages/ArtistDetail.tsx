import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { coverArtUrl, getAlbum, getArtist, type ArtistWithAlbumsID3 } from "@/api/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { MediaCard } from "@/components/MediaCard";
import { Loading } from "@/components/Loading";
import { PlayIcon } from "@/components/icons";

export function ArtistDetail() {
  const { id } = useParams<{ id: string }>();
  const [artist, setArtist] = useState<ArtistWithAlbumsID3 | null>(null);
  const { playQueue } = usePlayer();

  useEffect(() => {
    if (!id) return;
    setArtist(null);
    getArtist(id).then(setArtist);
  }, [id]);

  if (!artist) return <Loading />;

  const albums = artist.album ?? [];

  async function handlePlayAll() {
    const songLists = await Promise.all(albums.map((a) => getAlbum(a.id)));
    playQueue(songLists.flatMap((a) => a.song ?? []));
  }

  async function handlePlayAlbum(albumId: string) {
    const album = await getAlbum(albumId);
    playQueue(album.song ?? []);
  }

  return (
    <div>
      <div className="flex flex-col items-center gap-6 pt-8 sm:flex-row sm:items-end">
        <img
          src={coverArtUrl(artist.coverArt, 400)}
          alt=""
          className="h-48 w-48 flex-shrink-0 rounded-full object-cover shadow-2xl sm:h-56 sm:w-56"
        />
        <div className="flex flex-col gap-2 text-center sm:text-left">
          <span className="text-xs font-semibold uppercase">Artist</span>
          <h1 className="text-3xl font-black sm:text-5xl">{artist.name}</h1>
          <p className="text-sm text-spotify-gray">{albums.length} albums</p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-6">
        <button
          type="button"
          onClick={handlePlayAll}
          disabled={albums.length === 0}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-spotify-green text-black transition hover:scale-105 hover:bg-spotify-green-bright disabled:opacity-50"
          aria-label="Play all"
        >
          <PlayIcon className="h-6 w-6 fill-current pl-1" />
        </button>
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold">Albums</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {albums.map((album) => (
            <MediaCard
              key={album.id}
              to={`/album/${album.id}`}
              image={coverArtUrl(album.coverArt)}
              title={album.name}
              subtitle={album.year ? String(album.year) : undefined}
              onPlay={() => handlePlayAlbum(album.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
