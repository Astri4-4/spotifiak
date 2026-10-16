import { useEffect, useSyncExternalStore } from "react";
import {
  chatEventsUrl,
  getConversations,
  getMessages,
  markRead,
  sendMessage,
  type ChatMessage,
  type Conversation,
} from "@/api/chat";
import { showToast } from "./songMenu";

// Your conversations, kept up to date by the Jam server's live stream while
// the app is open: the list (with what's unread), and the messages of the
// ones you've opened.

interface Thread {
  messages: ChatMessage[];
  /** Older messages to load. */
  more: boolean;
}

interface State {
  /** null until loaded. */
  conversations: Conversation[] | null;
  threads: Record<string, Thread>;
}

let state: State = { conversations: null, threads: {} };
let me: string | null = null;
/** The conversation on screen: its messages are read as they come. */
let openWith: string | null = null;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

/** One line about a message, for the list and pop-ups. */
export function messagePreview(message: ChatMessage, username: string | null): string {
  const mine = message.from === username;
  switch (message.kind) {
    case "song":
      return `${mine ? "You sent" : "Sent you"} ${message.name ?? "a song"}${message.artist ? ` by ${message.artist}` : ""}`;
    case "jam":
      return mine ? "You invited them to a Jam" : `Invited you to ${message.name === message.from ? "their" : `${message.name}'s`} Jam`;
    case "mix":
      return mine ? `You invited them to the mix ${message.name}` : `Invited you to the mix ${message.name}`;
    default:
      return mine ? `You: ${message.text ?? ""}` : (message.text ?? "");
  }
}

export async function refreshConversations() {
  try {
    set({ conversations: await getConversations() });
  } catch {
    if (state.conversations === null) set({ conversations: [] });
  }
}

/** Puts a message in its conversation (once: it also comes back from the stream). */
function receive(other: string, message: ChatMessage) {
  const thread = state.threads[other];
  if (thread && !thread.messages.some((m) => m.id === message.id)) {
    set({ threads: { ...state.threads, [other]: { ...thread, messages: [...thread.messages, message] } } });
  }
  const list = state.conversations ?? [];
  const existing = list.find((c) => c.with === other);
  if (existing?.last.id === message.id) return;
  const reading = openWith === other && document.visibilityState === "visible";
  const fromThem = message.from !== me;
  const unread = fromThem && !reading ? (existing?.unread ?? 0) + 1 : fromThem ? 0 : (existing?.unread ?? 0);
  set({ conversations: [{ with: other, last: message, unread }, ...list.filter((c) => c.with !== other)] });
  if (fromThem && reading) void markRead(other).catch(() => void 0);
  if (fromThem && !reading) showToast(`${message.from}: ${messagePreview(message, me)}`);
}

function clearUnread(other: string) {
  const list = state.conversations;
  if (list?.some((c) => c.with === other && c.unread)) {
    set({ conversations: list.map((c) => (c.with === other ? { ...c, unread: 0 } : c)) });
  }
}

/** Keeps the conversations live while signed in. Mount once. */
export function useChatConnection(username: string | null) {
  useEffect(() => {
    me = username;
    set({ conversations: null, threads: {} });
    if (!username) return;
    const url = chatEventsUrl();
    if (!url) {
      set({ conversations: [] });
      return;
    }
    const es = new EventSource(url);
    // (Re)connected: catch up on what came while away.
    es.onopen = () => {
      void refreshConversations();
      for (const other of Object.keys(state.threads)) void loadThread(other);
    };
    es.addEventListener("message", (e: MessageEvent<string>) => {
      const { with: other, message } = JSON.parse(e.data) as { with: string; message: ChatMessage };
      receive(other, message);
    });
    es.addEventListener("read", (e: MessageEvent<string>) => clearUnread((JSON.parse(e.data) as { with: string }).with));
    return () => es.close();
  }, [username]);
}

async function loadThread(other: string) {
  const { messages, more } = await getMessages(other);
  set({ threads: { ...state.threads, [other]: { messages, more } } });
}

/** Opens a conversation: loads it, and reads its messages while it's on screen. */
export function useOpenConversation(other: string | undefined) {
  useEffect(() => {
    if (!other) return;
    openWith = other;
    void loadThread(other).catch(() => set({ threads: { ...state.threads, [other]: { messages: [], more: false } } }));
    const read = () => {
      if (document.visibilityState !== "visible") return;
      clearUnread(other);
      void markRead(other).catch(() => void 0);
    };
    read();
    document.addEventListener("visibilitychange", read);
    return () => {
      if (openWith === other) openWith = null;
      document.removeEventListener("visibilitychange", read);
    };
  }, [other]);
}

export async function loadOlder(other: string) {
  const thread = state.threads[other];
  if (!thread?.more || !thread.messages.length) return;
  const { messages, more } = await getMessages(other, thread.messages[0].at);
  const current = state.threads[other] ?? thread;
  set({ threads: { ...state.threads, [other]: { messages: [...messages, ...current.messages], more } } });
}

export async function send(other: string, text: string) {
  receive(other, await sendMessage(other, text));
}

export function useChat(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** How many messages you haven't read, across your conversations. */
export function useUnreadCount(): number {
  return (useChat().conversations ?? []).reduce((n, c) => n + c.unread, 0);
}
