import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  coverArtUrl,
  getAlbum,
  getArtist,
  getArtistInfo2,
  getTopSongs,
  type ArtistWithAlbumsID3,
} from "@/api/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { MediaCard } from "@/components/MediaCard";
import { Loading } from "@/components/Loading";
import { DetailHeader, PlayButton, ShufflePlayButton } from "@/components/DetailHeader";
import { CardGrid } from "@/components/CardGrid";
import { TrackList } from "@/components/TrackList";
import { HideDuplicatesButton } from "@/components/HideDuplicatesButton";
import { FollowEventsButton } from "@/components/FollowEventsButton";
import { LikeCollectionButton } from "@/components/LikeCollectionButton";
import { useHidden, useVisibleAlbums, useVisibleSongs, visibleIndices } from "@/lib/hidden";
import { shuffled } from "@/lib/shuffle";
import { formatPlays } from "@/lib/format";
import { useStreamCount } from "@/lib/streams";
import type { AlbumID3, ArtistInfo2, Child } from "@/types/subsonic";

const NO_ALBUMS: AlbumID3[] = [];
const NO_SONGS: Child[] = [];
/** Popular songs shown before "See more". */
const POPULAR_SHOWN = 5;
/** Albums with this many songs or fewer are singles and EPs. */
const SINGLE_MAX_SONGS = 3;

/** Last.fm's biography is HTML ending with a "Read more on Last.fm" link: plain text without it. */
function cleanBiography(html: string | undefined): string {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("a").forEach((a) => {
    if (/last\.fm/i.test(a.getAttribute("href") ?? "")) a.remove();
  });
  return (doc.body.textContent ?? "").trim();
}

export function ArtistDetail() {
  const { id } = useParams<{ id: string }>();
  const [artist, setArtist] = useState<ArtistWithAlbumsID3 | null>(null);
  const [info, setInfo] = useState<ArtistInfo2 | null>(null);
  /** Last.fm's popular songs, or else yours; null while loading. */
  const [popular, setPopular] = useState<{ songs: Child[]; yours: boolean } | null>(null);
  const [showAllPopular, setShowAllPopular] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const { playQueue } = usePlayer();
  const hidden = useHidden();
  const allAlbums = artist?.album ?? NO_ALBUMS;
  // Albums made only of hidden duplicates (singles...) aren't shown.
  const albums = useVisibleAlbums(allAlbums);
  const popularSongs = useVisibleSongs(popular?.songs ?? NO_SONGS);
  const plays = useStreamCount("artists", id);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setArtist(null);
    setInfo(null);
    setPopular(null);
    setShowAllPopular(false);
    setBioOpen(false);
    getArtist(id).then(async (a) => {
      if (cancelled) return;
      setArtist(a);
      getArtistInfo2(id)
        .then((i) => !cancelled && setInfo(i))
        .catch(() => !cancelled && setInfo({}));
      let songs = await getTopSongs(a.name).catch(() => [] as Child[]);
      let yours = false;
      // Without Last.fm: the ones you play the most.
      if (!songs.length) {
        const all = (await Promise.all((a.album ?? []).map((al) => getAlbum(al.id).catch(() => null)))).flatMap(
          (al) => al?.song ?? [],
        );
        songs = all.filter((s) => (s.playCount ?? 0) > 0).sort((x, y) => (y.playCount ?? 0) - (x.playCount ?? 0)).slice(0, 10);
        yours = true;
      }
      if (!cancelled) setPopular({ songs, yours });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!artist) return <Loading />;

  async function allSongs() {
    return (await Promise.all(allAlbums.map((a) => getAlbum(a.id)))).flatMap((a) => a.song ?? []);
  }

  async function visibleSongs() {
    const songs = (await Promise.all(albums.map((a) => getAlbum(a.id)))).flatMap((a) => a.song ?? []);
    return visibleIndices(songs, hidden).map((i) => songs[i]);
  }

  async function handlePlayAlbum(albumId: string) {
    const album = await getAlbum(albumId);
    playQueue(album.song ?? []);
  }

  const byYear = [...albums].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  const fullAlbums = byYear.filter((a) => (a.songCount ?? SINGLE_MAX_SONGS + 1) > SINGLE_MAX_SONGS);
  const singles = byYear.filter((a) => (a.songCount ?? SINGLE_MAX_SONGS + 1) <= SINGLE_MAX_SONGS);
  const biography = cleanBiography(info?.biography);
  const similar = info?.similarArtist ?? [];

  const albumGrid = (list: AlbumID3[]) => (
    <CardGrid>
      {list.map((album) => (
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
  );

  return (
    <div>
      <DetailHeader
        kind="Artist"
        title={artist.name}
        image={<img src={coverArtUrl(artist.coverArt, 400)} alt="" className="h-full w-full rounded-full object-cover" />}
        meta={`${albums.length} album${albums.length === 1 ? "" : "s"}${plays !== null ? ` · ${formatPlays(plays)}` : ""}`}
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 sm:mt-6">
        <PlayButton onClick={() => void visibleSongs().then((s) => playQueue(s))} disabled={albums.length === 0} label="Play all" />
        <ShufflePlayButton
          onClick={() => void visibleSongs().then((s) => playQueue(shuffled(s)))}
          disabled={albums.length === 0}
          label="Shuffle artist"
        />
        <LikeCollectionButton kind="artist" id={artist.id} name={artist.name} starred={artist.starred} />
        <HideDuplicatesButton what="artist" songs={allSongs} albumIds={allAlbums.map((a) => a.id)} />
        <FollowEventsButton artist={artist} />
      </div>

      {popularSongs.length > 0 && (
        <section className="mt-8 md:mt-10">
          <h2 className="mb-2 text-xl font-bold">{popular?.yours ? "Your most played" : "Popular"}</h2>
          <TrackList
            tracks={showAllPopular ? popularSongs : popularSongs.slice(0, POPULAR_SHOWN)}
            queue={popularSongs}
            showCover
            showAlbum
            showPlays
            showArtist={false}
          />
          {popularSongs.length > POPULAR_SHOWN && (
            <button
              type="button"
              onClick={() => setShowAllPopular((v) => !v)}
              className="mt-2 px-2 text-sm font-semibold text-spotify-gray hover:text-white md:px-4"
            >
              {showAllPopular ? "Show less" : "See more"}
            </button>
          )}
        </section>
      )}

      {fullAlbums.length > 0 && (
        <section className="mt-8 md:mt-10">
          <h2 className="mb-4 text-xl font-bold">Albums</h2>
          {albumGrid(fullAlbums)}
        </section>
      )}

      {singles.length > 0 && (
        <section className="mt-8 md:mt-10">
          <h2 className="mb-4 text-xl font-bold">Singles and EPs</h2>
          {albumGrid(singles)}
        </section>
      )}

      {biography && (
        <section className="mt-8 md:mt-10">
          <h2 className="mb-4 text-xl font-bold">About</h2>
          <div className="max-w-3xl rounded-lg bg-white/5 p-4 sm:p-5">
            <p className={`whitespace-pre-line text-sm leading-relaxed text-spotify-gray ${bioOpen ? "" : "line-clamp-4"}`}>
              {biography}
            </p>
            <div className="mt-2 flex gap-4 text-sm font-semibold">
              <button type="button" onClick={() => setBioOpen((v) => !v)} className="hover:underline">
                {bioOpen ? "Show less" : "Read more"}
              </button>
              {info?.lastFmUrl && (
                <a href={info.lastFmUrl} target="_blank" rel="noreferrer" className="text-spotify-gray hover:text-white hover:underline">
                  On Last.fm
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {similar.length > 0 && (
        <section className="mt-8 md:mt-10">
          <h2 className="mb-4 text-xl font-bold">Fans also like</h2>
          <CardGrid rowOnPhones>
            {similar.map((a) => (
              <MediaCard key={a.id} to={`/artist/${a.id}`} image={coverArtUrl(a.coverArt)} title={a.name} subtitle="Artist" round />
            ))}
          </CardGrid>
        </section>
      )}
    </div>
  );
}
