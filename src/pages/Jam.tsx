import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useJam } from "@/context/JamContext";
import { coverArtUrl } from "@/api/subsonic";
import { parseJamCode, type JamQueueItem } from "@/api/jam";
import { Loading } from "@/components/Loading";
import { jamInviteOrigin } from "@/lib/servers";
import { CheckIcon, CloseIcon, JamIcon } from "@/components/icons";

export function Jam() {
  const { jamId, jam } = useJam();
  if (!jamId) return <StartJam />;
  if (!jam) return <Loading label="Joining the Jam..." />;
  return <JamSession />;
}

function StartJam() {
  const { startJam, notice, clearNotice } = useJam();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  async function handleStart() {
    setStarting(true);
    clearNotice();
    try {
      await startJam();
    } catch {
      // startJam already put the reason in `notice`.
    } finally {
      setStarting(false);
    }
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault();
    const parsed = parseJamCode(code);
    if (!parsed) {
      setCodeError("Enter the 6-character code or paste the invite link.");
      return;
    }
    navigate(`/jam/${parsed}`);
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-6 pt-10 text-center md:pt-16">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-spotify-green to-spotify-green/40">
        <JamIcon className="h-10 w-10 text-on-accent" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold sm:text-3xl">Start a Jam</h1>
        <p className="text-spotify-gray">
          Listen together in real time. Friends with an account on this Navidrome server can join from their own
          device, add songs to the queue and hear the same thing as you.
        </p>
      </div>

      {notice && <p className="rounded-md bg-white/10 px-4 py-2 text-sm">{notice}</p>}

      <button
        type="button"
        onClick={handleStart}
        disabled={starting}
        className="rounded-full bg-spotify-green px-8 py-3 font-bold text-on-accent transition hover:scale-105 hover:bg-spotify-green-bright disabled:opacity-50"
      >
        {starting ? "Starting..." : "Start a Jam"}
      </button>

      <div className="flex w-full items-center gap-3 text-xs uppercase tracking-wide text-spotify-gray">
        <span className="h-px flex-1 bg-white/10" />
        or join one
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={handleJoin} className="flex w-full flex-col gap-2 sm:flex-row">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setCodeError(null);
          }}
          placeholder="Jam code or invite link"
          autoCapitalize="characters"
          className="min-w-0 flex-1 rounded-full border border-white/20 bg-transparent px-5 py-3 text-base outline-none focus:border-white sm:text-sm"
        />
        <button
          type="submit"
          className="rounded-full border border-white/40 px-6 py-3 text-sm font-bold hover:border-white hover:scale-[1.02]"
        >
          Join
        </button>
      </form>
      {codeError && <p className="-mt-4 text-sm text-red-400">{codeError}</p>}
    </div>
  );
}

function JamSession() {
  const { username } = useAuth();
  const { jam, status, isHost, canControl, notice, clearNotice, act, leaveJam, endJam } = useJam();
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!jam) return null;

  const upcoming = jam.queue.slice(Math.max(jam.currentIndex, 0));
  const nowPlaying = jam.currentIndex >= 0 && jam.currentIndex < jam.queue.length ? upcoming[0] : null;
  const nextUp = nowPlaying ? upcoming.slice(1) : upcoming;

  const canRemove = (item: JamQueueItem) => canControl || item.addedBy === username;

  return (
    <div className="flex flex-col gap-8 pt-4 md:pt-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-spotify-green to-spotify-green/40">
            <JamIcon className="h-7 w-7 text-on-accent" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold sm:text-3xl">{isHost ? "Your Jam" : `${jam.host}'s Jam`}</h1>
            <p className="flex items-center gap-2 text-sm text-spotify-gray">
              <span
                className={`h-2 w-2 rounded-full ${status === "live" ? "bg-spotify-green" : "animate-pulse bg-yellow-400"}`}
              />
              {status === "live"
                ? `${jam.members.length} listening`
                : "Reconnecting..."}
            </p>
          </div>
        </div>
        {isHost ? (
          <button
            type="button"
            onClick={() => (confirmEnd ? void endJam() : setConfirmEnd(true))}
            onBlur={() => setConfirmEnd(false)}
            className={`rounded-full px-5 py-2 text-sm font-bold transition ${
              confirmEnd ? "bg-red-500 text-pure-white" : "border border-white/40 hover:border-white"
            }`}
          >
            {confirmEnd ? "Click again to end for everyone" : "End Jam"}
          </button>
        ) : (
          <button
            type="button"
            onClick={leaveJam}
            className="rounded-full border border-white/40 px-5 py-2 text-sm font-bold hover:border-white"
          >
            Leave Jam
          </button>
        )}
      </div>

      {notice && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-white/10 px-4 py-2 text-sm">
          {notice}
          <button type="button" onClick={clearNotice} aria-label="Dismiss" className="text-spotify-gray hover:text-white">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <InviteCard code={jam.id} />

        <section className="rounded-lg bg-white/5 p-4 sm:p-5">
          <h2 className="mb-3 font-bold">Who's here</h2>
          <ul className="flex flex-wrap gap-2">
            {jam.members.map((m) => (
              <li key={m.clientId} className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 font-bold text-white">
                  {m.username[0]?.toUpperCase()}
                </span>
                {m.username}
                {m.username === jam.host && <span className="text-xs text-spotify-green">Host</span>}
                {m.username === username && m.username !== jam.host && <span className="text-xs text-spotify-gray">You</span>}
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-white/10 pt-4">
            {isHost ? (
              <label className="flex cursor-pointer items-center justify-between gap-4 text-sm">
                <span>
                  <span className="block font-semibold">Let guests control playback</span>
                  <span className="text-spotify-gray">Play, pause, skip and seek. Anyone can always add songs.</span>
                </span>
                <Toggle
                  checked={jam.guestsCanControl}
                  onChange={(value) => void act({ type: "setGuestControl", value })}
                />
              </label>
            ) : (
              <p className="text-sm text-spotify-gray">
                {jam.guestsCanControl
                  ? "Everyone can control playback and add songs."
                  : `You can add songs; ${jam.host} controls playback.`}
              </p>
            )}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-bold">Now playing</h2>
        {nowPlaying ? (
          <QueueRow item={nowPlaying} isCurrent playing={jam.playing} canJump={false} canRemove={canRemove(nowPlaying)} />
        ) : (
          <p className="text-spotify-gray">
            Nothing yet.{" "}
            <Link to="/search" className="font-semibold text-white hover:underline">
              Find something to play
            </Link>{" "}
            - songs you play or queue go to everyone in the Jam.
          </p>
        )}
      </section>

      {nextUp.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Next up</h2>
          <div className="flex flex-col">
            {nextUp.map((item) => (
              <QueueRow key={item.uid} item={item} canJump={canControl} canRemove={canRemove(item)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function QueueRow({
  item,
  isCurrent = false,
  playing = false,
  canJump,
  canRemove,
}: {
  item: JamQueueItem;
  isCurrent?: boolean;
  playing?: boolean;
  canJump: boolean;
  canRemove: boolean;
}) {
  const { act } = useJam();
  const { track } = item;
  return (
    <div className="group flex items-center gap-3 rounded-md p-2 hover:bg-white/10">
      <button
        type="button"
        disabled={!canJump}
        onClick={() => void act({ type: "jump", uid: item.uid })}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        aria-label={canJump ? `Play ${track.title} now` : undefined}
      >
        <img src={coverArtUrl(track.coverArt, 80)} alt="" className="h-12 w-12 flex-shrink-0 rounded object-cover" />
        <span className="min-w-0">
          <span className={`block truncate font-medium ${isCurrent ? "text-spotify-green" : "text-white"}`}>
            {track.title}
          </span>
          <span className="block truncate text-sm text-spotify-gray">
            {track.artist}
            {isCurrent && !playing && " · Paused"}
          </span>
        </span>
      </button>
      <span className="hidden flex-shrink-0 text-xs text-spotify-gray sm:block">Added by {item.addedBy}</span>
      {canRemove && (
        <button
          type="button"
          onClick={() => void act({ type: "remove", uid: item.uid })}
          aria-label={`Remove ${track.title} from the Jam`}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-spotify-gray hover:bg-white/10 hover:text-white md:opacity-0 md:group-hover:opacity-100"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function InviteCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  // The desktop and mobile apps' own origin isn't reachable by others, so
  // invite people to the web deployment whose Jam server they use instead.
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    void jamInviteOrigin().then(setOrigin);
  }, []);
  const link = `${origin}/jam/${code}`;

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
      <h2 className="mb-3 font-bold">Invite friends</h2>
      <p className="mb-1 text-xs uppercase tracking-wide text-spotify-gray">Jam code</p>
      <p className="mb-4 font-mono text-3xl font-bold tracking-[0.3em]">{code}</p>
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
      <p className="mt-3 text-xs text-spotify-gray">Friends need an account on this Navidrome server to join.</p>
    </section>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${checked ? "bg-spotify-green" : "bg-spotify-gray-subdued"}`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${checked ? "left-6" : "left-1"}`}
      />
    </button>
  );
}
