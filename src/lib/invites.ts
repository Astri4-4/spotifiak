import { useEffect, useSyncExternalStore } from "react";
import { dismissInvite, getInvites, sendInvites, type Invite, type InviteKind } from "@/api/invites";

// Invitations to a Jam or a mix, and songs people sent you: the ones waiting
// for you and the ones you sent, polled from the Jam server while the app is
// visible. They show up in Chat (lib/chat.ts), which also tells you of new ones.

const POLL_MS = 20_000;

interface State {
  received: Invite[];
  sent: Invite[];
}

let state: State = { received: [], sent: [] };
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export async function refreshInvites() {
  try {
    set(await getInvites());
  } catch {
    // No Jam server, or it's down: no invites.
  }
}

/** It's been answered (from its card in Chat): no longer waiting. */
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
