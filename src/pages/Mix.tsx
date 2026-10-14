import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getMix, isFullMix, leaveMix, parseMixCode, sendTopSongs, setMixPlaylist, type Mix as MixData, type MixSummary } from "@/api/mixes";
import { createPlaylist, getPlaylist, setPlaylistSongs, updatePlaylist } from "@/api/subsonic";
import { SubsonicError } from "@/api/client";
import { useAuth } from "@/context/AuthContext";
import { usePlayer } from "@/context/PlayerContext";
import { getMyTopSongs, refreshMyPart } from "@/lib/mixes";
import { refreshPlaylists } from "@/lib/playlists";
import { jamInviteOrigin } from "@/lib/servers";
import { shuffled } from "@/lib/shuffle";
import { DetailHeader, PlayButton, ShufflePlayButton } from "@/components/DetailHeader";
import { Loading } from "@/components/Loading";
import { MixArt } from "@/components/MixArt";
import { TrackList } from "@/components/TrackList";
import { CheckIcon } from "@/components/icons";

/** A mix (for its members), or the invitation to join it: /mix/:code */
export function Mix() {
  const params = useParams<{ code: string }>();
  const code = parseMixCode(params.code ?? "");
  const { username } = useAuth();
  const [mix, setMix] = useState<MixData | MixSummary | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    setMix(undefined);
    getMix(code)
      .then(async (found) => {
        if (cancelled) return;
        setMix(found);
        // Keep your songs in it current.
        if (found && isFullMix(found) && username) {
          const refreshed = await refreshMyPart(found, username).catch(() => null);
          if (refreshed && !cancelled) setMix(refreshed);
        }
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [code, username]);

  if (error || !code || mix === null) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-16 text-center">
        <p className="text-lg font-semibold">{error ?? "This mix doesn't exist any more, or the code is wrong."}</p>
        <Link to="/mixes" className="rounded-full bg-white px-6 py-2 text-sm font-bold text-black">
          Back to Mixes
        </Link>
      </div>
    );
  }
  if (mix === undefined) return <Loading />;
  if (!isFullMix(mix)) return <JoinMix mix={mix} onJoined={setMix} />;
  return <MixView mix={mix} isOwner={mix.owner === username} username={username ?? ""} onChange={setMix} />;
}

function JoinMix({ mix, onJoined }: { mix: MixSummary; onJoined: (mix: MixData) => void }) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setJoining(true);
    setError(null);
    try {
      onJoined(await sendTopSongs(mix.id, await getMyTopSongs()));
    } catch (err) {
      setError((err as Error).message);
      setJoining(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 pt-10 text-center md:pt-16">
      <span className="h-24 w-24">
        <MixArt coverArts={[]} className="rounded-full" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{mix.owner} invited you to a mix</h1>
        <p className="text-spotify-gray">
          “{mix.name}” with {mix.members.map((m) => m.username).join(", ")}
        </p>
      </div>
      <button
        type="button"
        onClick={join}
        disabled={joining}
        className="rounded-full bg-spotify-green px-8 py-3 font-bold text-on-accent transition hover:scale-105 hover:bg-spotify-green-bright disabled:opacity-60 disabled:hover:scale-100"
      >
        {joining ? "Finding your top songs…" : "Join mix"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-xs text-spotify-gray">
        Joining shares your 50 most played songs (topped up with liked ones) with the people in this mix. You can leave
        any time.
      </p>
    </div>
  );
}

function MixView({
  mix,
  isOwner,
  username,
  onChange,
}: {
  mix: MixData;
  isOwner: boolean;
  username: string;
  onChange: (mix: MixData) => void;
}) {
  const { playQueue } = usePlayer();
  const navigate = useNavigate();
  const songs = mix.tracks.map((e) => e.track);
  const together = mix.members.length > 1;

  // Keep the owner's Navidrome copy in step with the mix.
  const trackKey = songs.map((s) => s.id).join(",");
  useEffect(() => {
    if (!isOwner || !mix.playlistId) return;
    syncPlaylist(mix).catch((err) => {
      // Deleted in Navidrome (error 70: not found): forget it, so it can be saved again.
      if (err instanceof SubsonicError && err.code === 70) void setMixPlaylist(mix.id, null).then(onChange);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, mix.playlistId, trackKey]);

  async function handleLeave() {
    const question = isOwner
      ? `Delete "${mix.name}" for everyone in it?`
      : `Leave "${mix.name}"? Your songs will be taken out of it.`;
    if (!confirm(question)) return;
    await leaveMix(mix.id);
    navigate("/mixes", { replace: true });
  }

  function noteFor(index: number) {
    if (!together) return undefined;
    const from = mix.tracks[index].from;
    if (from.length === mix.members.length) return "everyone's";
    return from.map((u) => (u === username ? "you" : u)).join(" & ");
  }

  return (
    <div>
      <DetailHeader
        kind="Mix"
        title={mix.name}
        image={<MixArt coverArts={songs.map((s) => s.coverArt)} />}
        meta={`${mix.members.map((m) => (m.username === username ? "You" : m.username)).join(" + ")} · ${songs.length} songs`}
      />
      <div className="mt-4 flex items-center gap-6 sm:mt-6">
        <PlayButton onClick={() => playQueue(songs)} disabled={songs.length === 0} label="Play mix" />
        <ShufflePlayButton onClick={() => playQueue(shuffled(songs))} disabled={songs.length === 0} label="Shuffle mix" />
        <button type="button" onClick={handleLeave} className="ml-auto text-sm font-semibold text-spotify-gray hover:text-white">
          {isOwner ? "Delete mix" : "Leave mix"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <InviteCard code={mix.id} alone={!together} />
        {isOwner && <PlaylistCard mix={mix} onChange={onChange} />}
      </div>

      <div className="mt-6 sm:mt-8">
        {songs.length === 0 ? (
          <p className="text-spotify-gray">No songs yet: play some music, and the mix fills up as people join.</p>
        ) : (
          <TrackList tracks={songs} showAlbum showCover rowNote={noteFor} />
        )}
      </div>
    </div>
  );
}

/** Replaces the songs of the owner's Navidrome copy if they differ from the mix's. */
async function syncPlaylist(mix: MixData) {
  if (!mix.playlistId) return;
  const ids = mix.tracks.map((e) => e.track.id);
  const playlist = await getPlaylist(mix.playlistId);
  const current = (playlist.entry ?? []).map((s) => s.id);
  if (current.join(",") !== ids.join(",")) await setPlaylistSongs(mix.playlistId, ids);
}

function PlaylistCard({ mix, onChange }: { mix: MixData; onChange: (mix: MixData) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const playlist = await createPlaylist(mix.name);
      await updatePlaylist(playlist.id, {
        public: true,
        comment: `A mix of ${mix.members.map((m) => m.username).join(", ")}'s top songs, kept up to date by Spotifiak.`,
      });
      const updated = await setMixPlaylist(mix.id, playlist.id);
      await syncPlaylist(updated);
      refreshPlaylists();
      onChange(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg bg-white/5 p-4 sm:p-5">
      <h2 className="mb-2 font-bold">Navidrome playlist</h2>
      {mix.playlistId ? (
        <p className="text-sm text-spotify-gray">
          Saved as a{" "}
          <Link to={`/playlist/${mix.playlistId}`} className="text-white underline">
            public playlist
          </Link>{" "}
          everyone on the server can play from any app. It's updated when you open this mix.
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-spotify-gray">
            Also save it as a public playlist, so people can play it from any Subsonic app.
          </p>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:scale-[1.02] disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save as playlist"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}

function InviteCard({ code, alone }: { code: string; alone: boolean }) {
  const [copied, setCopied] = useState(false);
  // The desktop and mobile apps' own origin isn't reachable by others (see the Jam's invite).
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    void jamInviteOrigin().then(setOrigin);
  }, []);
  const link = `${origin}/mix/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API needs a secure context; the link is selectable below.
    }
  }

  return (
    <section className="rounded-lg bg-white/5 p-4 sm:p-5">
      <h2 className="mb-2 font-bold">{alone ? "Invite a friend to blend with" : "Invite more friends"}</h2>
      <p className="mb-3 text-sm text-spotify-gray">
        Code <span className="font-mono font-bold tracking-widest text-white">{code}</span>
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-full bg-black/40 px-4 py-2 text-sm text-spotify-gray outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:scale-[1.02]"
        >
          {copied && <CheckIcon className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </section>
  );
}
