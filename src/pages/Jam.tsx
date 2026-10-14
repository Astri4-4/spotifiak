import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useJam } from "@/context/JamContext";
import { coverArtUrl } from "@/api/subsonic";
import { parseJamCode, type JamQueueItem } from "@/api/jam";
import { Loading } from "@/components/Loading";
import { jamInviteOrigin } from "@/lib/servers";
import { CheckIcon, CloseIcon, DragHandleIcon, JamIcon } from "@/components/icons";
import { Avatar } from "@/components/Avatar";
import { useDragReorder } from "@/lib/useDragReorder";

/** The Jam: a page on narrow screens; in the side panel (`panel`) on wide ones. */
export function Jam({ panel = false }: { panel?: boolean }) {
  const { jamId, jam } = useJam();
  if (!jamId) return <StartJam panel={panel} />;
  if (!jam) return <JoiningJam />;
  return <JamSession panel={panel} />;
}

/** Waiting for the first state; explains (and offers a way out) if the event stream keeps failing. */
function JoiningJam() {
  const { notice, leaveJam } = useJam();
  return (
    <div>
      <Loading label="Joining the Jam..." />
      {notice && (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 text-center">
          <p className="rounded-md bg-white/10 px-4 py-2 text-sm">{notice}</p>
          <button
            type="button"
            onClick={leaveJam}
            className="rounded-full border border-white/40 px-5 py-2 text-sm font-bold hover:border-white"
          >
            Leave Jam
          </button>
        </div>
      )}
    </div>
  );
}

function StartJam({ panel }: { panel: boolean }) {
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
    <div className={`mx-auto flex max-w-lg flex-col items-center gap-6 text-center ${panel ? "pt-4" : "pt-10 md:pt-16"}`}>
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-spotify-green to-spotify-green/40">
        <JamIcon className="h-10 w-10 text-on-accent" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className={`font-bold ${panel ? "text-xl" : "text-2xl sm:text-3xl"}`}>Start a Jam</h1>
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

      <form onSubmit={handleJoin} className={`flex w-full flex-col gap-2 ${panel ? "" : "sm:flex-row"}`}>
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

function JamSession({ panel }: { panel: boolean }) {
  const { username } = useAuth();
  const { jam, status, isHost, canControl, notice, clearNotice, act, leaveJam, endJam } = useJam();
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!jam) return null;

  const upcoming = jam.queue.slice(Math.max(jam.currentIndex, 0));
  const nowPlaying = jam.currentIndex >= 0 && jam.currentIndex < jam.queue.length ? upcoming[0] : null;
  const nextUp = nowPlaying ? upcoming.slice(1) : upcoming;

  const canRemove = (item: JamQueueItem) => canControl || item.addedBy === username;

  return (
    <div className={`flex flex-col ${panel ? "gap-6" : "gap-8 pt-4 md:pt-6"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-spotify-green to-spotify-green/40">
            <JamIcon className="h-7 w-7 text-on-accent" />
          </span>
          <div className="min-w-0">
            <h1 className={`truncate font-bold ${panel ? "text-xl" : "text-2xl sm:text-3xl"}`}>{isHost ? "Your Jam" : `${jam.host}'s Jam`}</h1>
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

      <div className={`grid gap-4 ${panel ? "" : "lg:grid-cols-2"}`}>
        <InviteCard code={jam.id} panel={panel} />

        <section className="rounded-lg bg-white/5 p-4 sm:p-5">
          <h2 className="mb-3 font-bold">Who's here</h2>
          <ul className="flex flex-wrap gap-2">
            {jam.members.map((m) => (
              <li key={m.clientId} className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-sm">
                <Avatar username={m.username} className="h-7 w-7" />
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
        <h2 className={`mb-3 font-bold ${panel ? "text-base" : "text-xl"}`}>Now playing</h2>
        {nowPlaying ? (
          <QueueRow item={nowPlaying} isCurrent playing={jam.playing} canJump={false} canRemove={canRemove(nowPlaying)} panel={panel} />
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
        <NextUp items={nextUp} after={nowPlaying} canMove={canControl} canRemove={canRemove} panel={panel} />
      )}
    </div>
  );
}

/**
 * The songs coming up. Those who control playback can drag them into a new
 * order, shown at once until the Jam's next state confirms it.
 */
function NextUp({
  items,
  after,
  canMove,
  canRemove,
  panel,
}: {
  items: JamQueueItem[];
  /** The song playing, which the first one follows. */
  after: JamQueueItem | null;
  canMove: boolean;
  canRemove: (item: JamQueueItem) => boolean;
  panel: boolean;
}) {
  const { jam, act } = useJam();
  const [pending, setPending] = useState<{ version: number; order: string[] } | null>(null);
  // Only until the Jam's state changes (with this move, or anyone else's change).
  const shown =
    pending && pending.version === jam?.version
      ? pending.order.map((uid) => items.find((i) => i.uid === uid)).filter((i): i is JamQueueItem => Boolean(i))
      : items;

  const { itemProps, handleProps } = useDragReorder((from, to) => {
    const order = [...shown];
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    if (jam) setPending({ version: jam.version, order: order.map((i) => i.uid) });
    const afterUid = to === 0 ? (after?.uid ?? null) : order[to - 1].uid;
    void act({ type: "move", uid: moved.uid, afterUid });
  });

  return (
    <section>
      <h2 className={`mb-3 font-bold ${panel ? "text-base" : "text-xl"}`}>Next up</h2>
      <div className="flex flex-col">
        {shown.map((item, position) => (
          <div
            key={item.uid}
            {...(canMove ? itemProps(position) : {})}
            className="flex items-center gap-1 rounded-md data-[dragging]:bg-spotify-highlight-black data-[dragging]:shadow-xl"
          >
            {canMove && (
              <span
                {...handleProps(position)}
                aria-label={`Drag to move ${item.track.title}`}
                className="flex h-8 w-6 flex-shrink-0 items-center justify-center text-spotify-gray hover:text-white"
              >
                <DragHandleIcon className="h-4 w-4 fill-current" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <QueueRow item={item} canJump={canMove} canRemove={canRemove(item)} panel={panel} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QueueRow({
  item,
  isCurrent = false,
  playing = false,
  canJump,
  canRemove,
  panel = false,
}: {
  item: JamQueueItem;
  isCurrent?: boolean;
  playing?: boolean;
  canJump: boolean;
  canRemove: boolean;
  /** In the narrow side panel: who added it is a picture, named on hover. */
  panel?: boolean;
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
      {panel ? (
        <span title={`Added by ${item.addedBy}`} className="flex-shrink-0">
          <Avatar username={item.addedBy} className="h-6 w-6 text-xs" />
        </span>
      ) : (
        <span className="hidden flex-shrink-0 text-xs text-spotify-gray sm:block">Added by {item.addedBy}</span>
      )}
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

function InviteCard({ code, panel }: { code: string; panel: boolean }) {
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
      <div className={`flex flex-col gap-2 ${panel ? "" : "sm:flex-row"}`}>
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
