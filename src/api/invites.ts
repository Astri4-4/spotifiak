import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";

// Client for invitations to a Jam or a mix (server/invites.mjs), carried by
// the Jam server.

export type InviteKind = "jam" | "mix";

export interface Invite {
  id: string;
  kind: InviteKind;
  /** The Jam's or mix's code. */
  code: string;
  /** The mix's name, or the Jam's host. */
  name: string;
  from: string;
  to: string;
  /** When it was sent (ms since epoch). */
  at: number;
}

export class InviteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "InviteError";
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const base = jamBase();
  if (base === null) throw new InviteError(503, "Invites need a Jam server. Set one in Settings.");
  let res: Response;
  try {
    res = await fetch(`${base}/jam-api/invites${path}?${authSearchParams()}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new InviteError(0, "Couldn't reach the server.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new InviteError(res.status, data?.error ?? `Invite request failed (${res.status}).`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Invites waiting for you, and the ones you sent that are still waiting. */
export function getInvites(): Promise<{ received: Invite[]; sent: Invite[] }> {
  return call("");
}

/** Everyone else who uses an app with this server. */
export async function getInvitablePeople(): Promise<string[]> {
  return (await call<{ people: string[] }>("/people")).people;
}

/** Resolves to who was invited (people already in it are skipped). */
export async function sendInvites(kind: InviteKind, code: string, to: string[]): Promise<string[]> {
  return (await call<{ sent: string[] }>("", { kind, code, to })).sent;
}

export function dismissInvite(id: string): Promise<void> {
  return call(`/${id}/dismiss`, {});
}
