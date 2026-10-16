import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";

// Client for conversations between people (server/chat.mjs), carried by the
// Jam server. Invites to a Jam or a mix and songs people send land in them
// as cards.

export type MessageKind = "text" | "jam" | "mix" | "song";

export interface ChatMessage {
  id: string;
  from: string;
  /** When it was sent (ms since epoch). */
  at: number;
  kind: MessageKind;
  text?: string;
  /** A card's Jam or mix code, or song id. */
  code?: string;
  /** A card's mix name, Jam host, or song title. */
  name?: string;
  artist?: string;
  coverArt?: string;
}

export interface Conversation {
  /** The other person. */
  with: string;
  last: ChatMessage;
  unread: number;
}

/** What the live stream says. */
export type ChatEvent = { type: "message"; with: string; message: ChatMessage } | { type: "read"; with: string; at: number };

const NO_CHAT_SERVER = "Chat needs a Jam server. Set one in Settings.";

async function call<T>(path: string, body?: unknown): Promise<T> {
  const base = jamBase();
  if (base === null) throw new Error(NO_CHAT_SERVER);
  let res: Response;
  try {
    res = await fetch(`${base}/jam-api/chat${path}${path.includes("?") ? "&" : "?"}${authSearchParams()}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `The server couldn't do that right now (${res.status}).`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Your conversations, latest first. */
export async function getConversations(): Promise<Conversation[]> {
  return (await call<{ conversations: Conversation[] }>("")).conversations;
}

/** The latest messages with someone (before `before`), oldest first; `more` if there are older ones. */
export function getMessages(username: string, before?: number): Promise<{ messages: ChatMessage[]; more: boolean }> {
  return call(`/${encodeURIComponent(username)}${before ? `?before=${before}` : ""}`);
}

export async function sendMessage(username: string, text: string): Promise<ChatMessage> {
  return (await call<{ message: ChatMessage }>(`/${encodeURIComponent(username)}`, { text })).message;
}

export function markRead(username: string): Promise<void> {
  return call(`/${encodeURIComponent(username)}/read`, {});
}

/** The live stream of your messages, or null without a Jam server. */
export function chatEventsUrl(): string | null {
  const base = jamBase();
  return base === null ? null : `${base}/jam-api/chat/events?${authSearchParams()}`;
}
