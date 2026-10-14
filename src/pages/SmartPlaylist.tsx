import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createPlaylist, setPlaylistSongs } from "@/api/subsonic";
import type { Child } from "@/types/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { TrackList } from "@/components/TrackList";
import { Loading } from "@/components/Loading";
import { DetailHeader, PlayButton, ShufflePlayButton } from "@/components/DetailHeader";
import { SmartPlaylistArt } from "@/components/SmartPlaylistArt";
import { smartPlaylist } from "@/lib/smartPlaylists";
import { useVisibleSongs } from "@/lib/hidden";
import { refreshPlaylists } from "@/lib/playlists";
import { showToast } from "@/lib/songMenu";
import { shuffled } from "@/lib/shuffle";
import { formatDurationLong, formatTimeAgo } from "@/lib/format";

const NO_SONGS: Child[] = [];

/** A smart playlist (/smart/:id), worked out from your listening each time it's opened. */
export function SmartPlaylist() {
  const { id } = useParams<{ id: string }>();
  const playlist = smartPlaylist(id);
  const [songs, setSongs] = useState<Child[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { playQueue } = usePlayer();
  const navigate = useNavigate();
  const visible = useVisibleSongs(songs ?? NO_SONGS);

  useEffect(() => {
    if (!playlist) return;
    let cancelled = false;
    setSongs(null);
    setError(null);
    playlist
      .load()
      .then((s) => !cancelled && setSongs(s))
      .catch(() => !cancelled && setError("Couldn't load it. Try again in a moment."));
    return () => {
      cancelled = true;
    };
  }, [playlist]);

  if (!playlist) return <p className="pt-16 text-center text-spotify-gray">There's no such smart playlist.</p>;
  if (error) return <p className="pt-16 text-center text-spotify-gray">{error}</p>;
  if (!songs) return <Loading label={`Putting together ${playlist.name}...`} />;

  async function save() {
    if (!playlist) return;
    setSaving(true);
    try {
      const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
      const created = await createPlaylist(`${playlist.name} (${date})`);
      await setPlaylistSongs(created.id, visible.map((s) => s.id));
      refreshPlaylists();
      navigate(`/playlist/${created.id}`);
    } catch {
      showToast("Couldn't save it as a playlist");
      setSaving(false);
    }
  }

  const note = (index: number) => {
    const song = visible[index];
    if (playlist.id === "most-played" && song.playCount) return `${song.playCount} play${song.playCount === 1 ? "" : "s"}`;
    if ((playlist.id === "recently-played" || playlist.id === "forgotten-likes") && song.played) {
      return `played ${formatTimeAgo(Date.parse(song.played)).toLowerCase()}`;
    }
    return undefined;
  };
  const duration = visible.reduce((sum, s) => sum + (s.duration ?? 0), 0);

  return (
    <div>
      <DetailHeader
        kind="Smart playlist"
        title={playlist.name}
        image={<SmartPlaylistArt playlist={playlist} />}
        meta={
          <>
            <span className="mb-1 block">{playlist.description}. Updated as you listen.</span>
            {visible.length} songs{duration ? ` · ${formatDurationLong(duration)}` : ""}
          </>
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 sm:mt-6">
        <PlayButton onClick={() => playQueue(visible)} disabled={visible.length === 0} label={`Play ${playlist.name}`} />
        <ShufflePlayButton onClick={() => playQueue(shuffled(visible))} disabled={visible.length === 0} label={`Shuffle ${playlist.name}`} />
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || visible.length === 0}
          className="text-sm font-semibold text-spotify-gray hover:text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save as playlist"}
        </button>
      </div>
      <div className="mt-4 sm:mt-8">
        {visible.length === 0 ? (
          <p className="text-spotify-gray">Nothing here yet: it fills up as you listen and like songs.</p>
        ) : (
          <TrackList tracks={visible} showAlbum showCover rowNote={note} />
        )}
      </div>
    </div>
  );
}
