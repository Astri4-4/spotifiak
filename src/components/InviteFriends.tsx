import { useEffect, useState } from "react";
import { getInvitablePeople, type InviteKind } from "@/api/invites";
import { invite, useInvites } from "@/lib/invites";
import { Avatar } from "./Avatar";
import { CheckIcon } from "./icons";

/** Past this many people, a field to find someone. */
const FILTER_FROM = 8;

/**
 * The people of this server, to invite to a Jam or a mix from inside the app:
 * it shows up in their inbox. Those already in it aren't listed.
 */
export function InviteFriends({ kind, code, members }: { kind: InviteKind; code: string; members: string[] }) {
  const { sent } = useInvites();
  const [people, setPeople] = useState<string[] | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInvitablePeople()
      .then((p) => !cancelled && setPeople(p))
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!people) return null;
  const others = people.filter((p) => !members.includes(p));
  if (!others.length) {
    return (
      <p className="text-sm text-spotify-gray">
        {people.length ? "Everyone on this server is already in." : "No one else has used Spotifion here yet: send them the link."}
      </p>
    );
  }

  const invited = new Set(sent.filter((i) => i.kind === kind && i.code === code).map((i) => i.to));
  const query = filter.trim().toLowerCase();
  const shown = query ? others.filter((p) => p.toLowerCase().includes(query)) : others;

  async function send(username: string) {
    setBusy(username);
    setError(null);
    try {
      await invite(kind, code, [username]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {others.length > FILTER_FROM && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          type="search"
          placeholder="Find someone"
          className="mb-2 w-full rounded-full bg-black/40 px-4 py-2 text-base outline-none placeholder:text-spotify-gray md:text-sm"
        />
      )}
      <ul className="max-h-72 overflow-y-auto">
        {shown.map((username) => {
          const done = invited.has(username);
          return (
            <li key={username} className="flex items-center gap-3 rounded-md px-1 py-1.5">
              <Avatar username={username} className="h-8 w-8 text-sm" />
              <span className="min-w-0 flex-1 truncate text-sm">{username}</span>
              <button
                type="button"
                onClick={() => void send(username)}
                disabled={busy === username}
                aria-label={done ? `Invite ${username} again` : `Invite ${username}`}
                title={done ? "Invited: invite again" : undefined}
                className={`flex flex-shrink-0 items-center gap-1 rounded-full px-4 py-1 text-xs font-bold disabled:opacity-60 ${
                  done ? "text-spotify-gray hover:text-white" : "bg-white text-black hover:scale-[1.02]"
                }`}
              >
                {done && <CheckIcon className="h-4 w-4" />}
                {done ? "Invited" : "Invite"}
              </button>
            </li>
          );
        })}
        {!shown.length && <li className="px-1 py-1.5 text-sm text-spotify-gray">No one by that name.</li>}
      </ul>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
