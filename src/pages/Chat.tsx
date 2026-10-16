import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { coverArtUrl, getSong } from "@/api/subsonic";
import { getInvitablePeople } from "@/api/invites";
import type { ChatMessage } from "@/api/chat";
import { useAuth } from "@/context/AuthContext";
import { usePlayer } from "@/context/PlayerContext";
import { loadOlder, messagePreview, send, useChat, useOpenConversation } from "@/lib/chat";
import { answerInvite, useInvites } from "@/lib/invites";
import { formatTimeAgo } from "@/lib/format";
import { showToast } from "@/lib/songMenu";
import { Avatar } from "@/components/Avatar";
import { Loading } from "@/components/Loading";
import { ChevronLeftIcon, JamIcon, MixIcon, PlayIcon, PlusIcon, SendIcon } from "@/components/icons";

/** Conversations with other people: /chat, and one of them: /chat/:username */
export function Chat() {
  const { username: other } = useParams<{ username: string }>();

  return (
    <div className="pt-4 md:grid md:grid-cols-[17rem_minmax(0,1fr)] md:gap-6 md:pt-6">
      {/* Phones show the list or a conversation; wider screens both. */}
      <div className={other ? "hidden md:block" : ""}>
        <Conversations current={other} />
      </div>
      {other ? (
        <Thread key={other} other={other} />
      ) : (
        <p className="hidden pt-24 text-center text-sm text-spotify-gray md:block">
          Pick a conversation, or start one with New message.
        </p>
      )}
    </div>
  );
}

function Conversations({ current }: { current: string | undefined }) {
  const { conversations } = useChat();
  const { username } = useAuth();
  const [picking, setPicking] = useState(false);

  return (
    <div className="md:sticky md:top-20">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Chat</h1>
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-expanded={picking}
          className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black hover:scale-[1.02]"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          New message
        </button>
      </div>
      {picking && <PeoplePicker onPicked={() => setPicking(false)} />}
      {conversations === null ? (
        <Loading />
      ) : conversations.length === 0 ? (
        <p className="py-6 text-sm text-spotify-gray">
          No conversations yet. Write to someone, or send them a song from its menu: it lands here, like invites to a Jam or a mix.
        </p>
      ) : (
        <ul className="flex flex-col md:max-h-[calc(100dvh-16rem)] md:overflow-y-auto">
          {conversations.map((c) => (
            <li key={c.with}>
              <Link
                to={`/chat/${encodeURIComponent(c.with)}`}
                className={`flex items-center gap-3 rounded-md p-2 hover:bg-white/10 ${current === c.with ? "bg-white/10" : ""}`}
              >
                <Avatar username={c.with} className="h-11 w-11 flex-shrink-0 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate ${c.unread ? "font-bold" : "font-medium"}`}>{c.with}</span>
                    <span className="flex-shrink-0 text-xs text-spotify-gray">{formatTimeAgo(c.last.at)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-sm ${c.unread ? "text-white" : "text-spotify-gray"}`}>
                      {messagePreview(c.last, username)}
                    </span>
                    {c.unread > 0 && (
                      <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-spotify-green px-1.5 text-[11px] font-bold text-on-accent">
                        {c.unread > 99 ? "99+" : c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Everyone who uses an app with this server, to start a conversation with. */
function PeoplePicker({ onPicked }: { onPicked: () => void }) {
  const [people, setPeople] = useState<string[] | null>(null);
  const [filter, setFilter] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    getInvitablePeople()
      .then((p) => !cancelled && setPeople(p))
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!people) return <Loading />;
  const query = filter.trim().toLowerCase();
  const shown = query ? people.filter((p) => p.toLowerCase().includes(query)) : people;

  return (
    <div className="mb-4 rounded-lg bg-white/5 p-2">
      {people.length === 0 ? (
        <p className="p-2 text-sm text-spotify-gray">No one else has used Spotifion on this server yet.</p>
      ) : (
        <>
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            type="search"
            placeholder="To: find someone"
            className="mb-1 w-full rounded-full bg-black/40 px-4 py-2 text-base outline-none placeholder:text-spotify-gray md:text-sm"
          />
          <ul className="max-h-60 overflow-y-auto">
            {shown.map((person) => (
              <li key={person}>
                <button
                  type="button"
                  onClick={() => {
                    onPicked();
                    navigate(`/chat/${encodeURIComponent(person)}`);
                  }}
                  className="flex w-full items-center gap-3 rounded-md p-1.5 text-left hover:bg-white/10"
                >
                  <Avatar username={person} className="h-8 w-8 text-sm" />
                  <span className="truncate text-sm">{person}</span>
                </button>
              </li>
            ))}
            {!shown.length && <li className="p-1.5 text-sm text-spotify-gray">No one by that name.</li>}
          </ul>
        </>
      )}
    </div>
  );
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });

function Thread({ other }: { other: string }) {
  useOpenConversation(other);
  const thread = useChat().threads[other];
  const { username } = useAuth();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const lastId = thread?.messages[thread.messages.length - 1]?.id;

  // New messages (not older ones loaded above): show the latest.
  useEffect(() => {
    if (lastId) endRef.current?.scrollIntoView({ block: "end" });
  }, [lastId]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await send(other, trimmed);
      setText("");
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter goes to the next line (phones: the send button).
    if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(hover: none)").matches) {
      e.preventDefault();
      void submit();
    }
  }

  async function older() {
    setLoadingOlder(true);
    await loadOlder(other).catch(() => showToast("Couldn't load older messages"));
    setLoadingOlder(false);
  }

  return (
    <section className="flex min-h-[calc(100dvh-14rem)] flex-col">
      <div className="mb-2 flex items-center gap-3 border-b border-white/10 pb-3">
        <Link to="/chat" aria-label="All conversations" className="text-spotify-gray hover:text-white md:hidden">
          <ChevronLeftIcon className="h-6 w-6" />
        </Link>
        <Avatar username={other} className="h-9 w-9 text-sm" />
        <h2 className="truncate text-lg font-bold">{other}</h2>
      </div>

      <div className="flex flex-1 flex-col gap-1">
        {!thread ? (
          <Loading />
        ) : (
          <>
            {thread.more && (
              <button
                type="button"
                onClick={() => void older()}
                disabled={loadingOlder}
                className="mx-auto mb-2 rounded-full border border-spotify-gray-subdued px-4 py-1 text-xs font-bold hover:border-white disabled:opacity-50"
              >
                {loadingOlder ? "Loading…" : "Older messages"}
              </button>
            )}
            {thread.messages.length === 0 && (
              <p className="py-10 text-center text-sm text-spotify-gray">Say hi to {other}.</p>
            )}
            {thread.messages.map((m, i) => {
              const previous = thread.messages[i - 1];
              const newDay = !previous || new Date(previous.at).toDateString() !== new Date(m.at).toDateString();
              return (
                <div key={m.id}>
                  {newDay && <p className="py-2 text-center text-xs text-spotify-gray">{dayFormat.format(m.at)}</p>}
                  <Bubble message={m} mine={m.from === username} />
                </div>
              );
            })}
          </>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className="sticky bottom-0 -mx-4 mt-3 flex items-end gap-2 bg-spotify-base-black/90 px-4 py-3 backdrop-blur-md md:mx-0 md:rounded-lg md:px-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          maxLength={2000}
          placeholder={`Message ${other}`}
          aria-label={`Message ${other}`}
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-2xl bg-spotify-highlight-black px-4 py-2 text-base outline-none placeholder:text-spotify-gray focus:ring-2 focus:ring-white md:text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          aria-label="Send"
          title="Send"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-spotify-green text-on-accent transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const time = timeFormat.format(message.at);
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      {message.kind === "text" ? (
        <p
          title={time}
          className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm ${
            mine ? "rounded-br-sm bg-spotify-green text-on-accent" : "rounded-bl-sm bg-spotify-highlight-black text-white"
          }`}
        >
          {message.text}
        </p>
      ) : (
        <Card message={message} mine={mine} time={time} />
      )}
    </div>
  );
}

/** An invite to a Jam or a mix, or a song sent: with what to do about it. */
function Card({ message, mine, time }: { message: ChatMessage; mine: boolean; time: string }) {
  const navigate = useNavigate();
  const { playQueue, enqueue, inJam } = usePlayer();
  const { received } = useInvites();
  const code = message.code ?? "";

  /** Answered from here: off the invites still waiting. */
  function answered() {
    const invite = received.find((i) => i.kind === message.kind && i.code === code);
    if (invite) answerInvite(invite.id);
  }

  async function play() {
    answered();
    try {
      const song = await getSong(code);
      if (inJam) {
        enqueue([song]);
        showToast("Added to the Jam");
      } else {
        playQueue([song]);
      }
    } catch {
      showToast("This song isn't on the server any more");
    }
  }

  const frame = `w-72 max-w-[85%] rounded-2xl p-3 ${mine ? "rounded-br-sm bg-white/10" : "rounded-bl-sm bg-spotify-highlight-black"}`;

  if (message.kind === "song") {
    const page = `/track/${encodeURIComponent(code)}?from=${encodeURIComponent(message.from)}`;
    return (
      <div title={time} className={frame}>
        <p className="mb-2 text-xs text-spotify-gray">{mine ? "You sent a song" : `${message.from} sent you a song`}</p>
        <div className="flex items-center gap-3">
          <Link to={page} onClick={answered} className="flex min-w-0 flex-1 items-center gap-3">
            <img src={coverArtUrl(message.coverArt, 120)} alt="" className="h-14 w-14 flex-shrink-0 rounded object-cover" />
            <span className="min-w-0">
              <span className="block truncate font-semibold hover:underline">{message.name}</span>
              {message.artist && <span className="block truncate text-sm text-spotify-gray">{message.artist}</span>}
            </span>
          </Link>
          <button
            type="button"
            onClick={() => void play()}
            aria-label={`Play ${message.name ?? "the song"}`}
            title={inJam ? "Add to the Jam" : "Play"}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-spotify-green text-on-accent transition hover:scale-105"
          >
            <PlayIcon className="h-4 w-4 fill-current pl-0.5" />
          </button>
        </div>
      </div>
    );
  }

  const jam = message.kind === "jam";
  const title = jam
    ? mine
      ? "You invited them to a Jam"
      : `${message.from} invited you to ${message.name === message.from ? "their" : `${message.name}'s`} Jam`
    : mine
      ? `You invited them to the mix ${message.name}`
      : `${message.from} invited you to the mix ${message.name}`;

  return (
    <div title={time} className={frame}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-spotify-green text-on-accent">
          {jam ? <JamIcon className="h-5 w-5" /> : <MixIcon className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1 text-sm">{title}</span>
      </div>
      <button
        type="button"
        onClick={() => {
          answered();
          // The Jam's and the mix's own pages ask to confirm: joining a Jam starts its music.
          navigate(jam ? `/jam/${code}` : `/mix/${code}`);
        }}
        className="mt-3 w-full rounded-full bg-white py-1.5 text-xs font-bold text-black hover:scale-[1.01]"
      >
        {jam ? (mine ? "Open the Jam" : "Join") : "Open the mix"}
      </button>
    </div>
  );
}
