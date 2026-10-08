import { useEffect, useState } from "react";
import { getAlbum, getAlbumList2, coverArtUrl, type AlbumID3 } from "@/api/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { MediaCard } from "@/components/MediaCard";
import { CardGrid } from "@/components/CardGrid";
import { Loading } from "@/components/Loading";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function AlbumRow({ title, albums }: { title: string; albums: AlbumID3[] }) {
  const { playQueue } = usePlayer();

  async function handlePlay(albumId: string) {
    const album = await getAlbum(albumId);
    playQueue(album.song ?? []);
  }

  if (albums.length === 0) return null;

  return (
    <section className="mb-8 md:mb-10">
      <h2 className="mb-3 text-xl font-bold md:mb-4 sm:text-2xl">{title}</h2>
      <CardGrid>
        {albums.map((album) => (
          <MediaCard
            key={album.id}
            to={`/album/${album.id}`}
            image={coverArtUrl(album.coverArt)}
            title={album.name}
            subtitle={album.artist}
            onPlay={() => handlePlay(album.id)}
          />
        ))}
      </CardGrid>
    </section>
  );
}

export function Home() {
  const [recent, setRecent] = useState<AlbumID3[] | null>(null);
  const [random, setRandom] = useState<AlbumID3[] | null>(null);
  const [frequent, setFrequent] = useState<AlbumID3[] | null>(null);

  useEffect(() => {
    getAlbumList2("newest", 12).then(setRecent).catch(() => setRecent([]));
    getAlbumList2("random", 12).then(setRandom).catch(() => setRandom([]));
    getAlbumList2("frequent", 12).then(setFrequent).catch(() => setFrequent([]));
  }, []);

  if (recent === null || random === null || frequent === null) {
    return <Loading label="Loading your music..." />;
  }

  return (
    <div className="pt-4 md:pt-6">
      <h1 className="mb-4 text-2xl md:mb-6 font-bold sm:text-3xl">{greeting()}</h1>
      <AlbumRow title="Recently added" albums={recent} />
      <AlbumRow title="Most played" albums={frequent} />
      <AlbumRow title="Explore your library" albums={random} />
    </div>
  );
}
