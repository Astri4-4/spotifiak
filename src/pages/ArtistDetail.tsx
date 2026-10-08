import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { coverArtUrl, getAlbum, getArtist, type ArtistWithAlbumsID3 } from "@/api/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { MediaCard } from "@/components/MediaCard";
import { Loading } from "@/components/Loading";
import { DetailHeader, PlayButton } from "@/components/DetailHeader";
import { CardGrid } from "@/components/CardGrid";

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
      <DetailHeader
        kind="Artist"
        title={artist.name}
        image={<img src={coverArtUrl(artist.coverArt, 400)} alt="" className="h-full w-full rounded-full object-cover" />}
        meta={`${albums.length} albums`}
      />
      <div className="mt-4 flex items-center gap-6 sm:mt-6">
        <PlayButton onClick={handlePlayAll} disabled={albums.length === 0} label="Play all" />
      </div>

      <section className="mt-8 md:mt-10">
        <h2 className="mb-4 text-xl font-bold">Albums</h2>
        <CardGrid>
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
        </CardGrid>
      </section>
    </div>
  );
}
