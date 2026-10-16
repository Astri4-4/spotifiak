import { useEffect, useSyncExternalStore } from "react";
import { dismissInvite, getInvites, sendInvites, type Invite, type InviteKind } from "@/api/invites";
import { showToast } from "./songMenu";

// Invitations to a Jam or a mix, and songs people sent you: the ones waiting
// for you (the inbox in the top bar) and the ones you sent, polled from the
// Jam server while the app is visible.

const POLL_MS = 20_000;

interface State {
  received: Invite[];
  sent: Invite[];
}

let state: State = { received: [], sent: [] };
/** Invites already seen, so only new ones pop up. null until the first answer. */
let seen: Set<string> | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function inviteText(invite: Invite): string {
  if (invite.kind === "song") return `${invite.from} sent you ${invite.name}${invite.artist ? ` by ${invite.artist}` : ""}`;
  if (invite.kind === "mix") return `${invite.from} invited you to the mix ${invite.name}`;
  // A Jam's name is its host's: a guest can invite people too.
  return `${invite.from} invited you to ${invite.name === invite.from ? "their" : `${invite.name}'s`} Jam`;
}

export async function refreshInvites() {
  try {
    const { received, sent } = await getInvites();
    const fresh = seen ? received.filter((i) => !seen!.has(i.id)) : [];
    seen = new Set(received.map((i) => i.id));
    set({ received, sent });
    if (fresh.length) showToast(fresh.length === 1 ? inviteText(fresh[0]) : `${fresh.length} new in your inbox`);
  } catch {
    // No Jam server, or it's down: no invites.
  }
}

/** Removes it from your inbox: declined, or accepted (joining it would also clear it; a song needs this). */
export function answerInvite(id: string) {
  set({ received: state.received.filter((i) => i.id !== id) });
  void dismissInvite(id).catch(() => void 0);
}

/** Invites people; resolves to who was invited. */
export async function invite(kind: InviteKind, code: string, to: string[]): Promise<string[]> {
  const invited = await sendInvites(kind, code, to);
  void refreshInvites();
  return invited;
}

/** Keeps the invites up to date while signed in. Mount once. */
export function useInvitePolling(username: string | null) {
  useEffect(() => {
    set({ received: [], sent: [] });
    seen = null;
    if (!username) return;
    let timer: number | undefined;
    let cancelled = false;
    async function tick() {
      window.clearTimeout(timer);
      if (document.visibilityState === "visible") await refreshInvites();
      if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
    }
    void tick();
    const onVisible = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [username]);
}

export function useInvites(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
