// Chat: conversations between two people of the Navidrome server. Besides
// what they write, invitations to a Jam or a mix and songs sent from the app
// land in the conversation as cards (see invites.mjs, which posts them).
//
//   GET  /jam-api/chat                     { conversations } the caller's, latest first
//   GET  /jam-api/chat/events              SSE: "message" { with, message } and "read" { with, at }
//   GET  /jam-api/chat/:user?before=<at>   { messages } the latest ones (before `before`), oldest first
//   POST /jam-api/chat/:user               { text } send a message
//   POST /jam-api/chat/:user/read          everything up to now is read
//
// Kept in $JAM_DATA_DIR/chat.json when set, else until the server restarts.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.JAM_DATA_DIR || "";
const CHAT_FILE = DATA_DIR ? path.join(DATA_DIR, "chat.json") : "";
const MAX_TEXT = 2000;
/** Older messages are dropped past this many in a conversation. */
const MAX_KEPT = 1000;
const PAGE = 50;
const HEARTBEAT_MS = 15_000;
const USERNAME = /^[^\n/]{1,100}$/;

/**
 * @typedef {{
 *   id: string, from: string, at: number,
 *   kind: "text" | "jam" | "mix" | "song",
 *   text?: string,
 *   code?: string, name?: string, artist?: string, coverArt?: string,
 * }} Message
 *   A card (jam, mix, song) carries what it's for: the Jam's or mix's code
 *   and name (a Jam's is its host's), or the song's id, title, artist and cover.
 * @typedef {{ users: [string, string], messages: Message[], read: Record<string, number> }} Conversation
 */

/** @type {Map<string, Conversation>} by key(a, b) */
const conversations = load();
/** Each person's open apps. @type {Map<string, Set<import("node:http").ServerResponse>>} */
const streams = new Map();

/** The same conversation whoever opens it. */
function key(a, b) {
  return [a, b].sort().join("\n");
}

function load() {
  try {
    if (CHAT_FILE) {
      const saved = JSON.parse(fs.readFileSync(CHAT_FILE, "utf8"));
      return new Map((saved.conversations ?? []).map((c) => [key(c.users[0], c.users[1]), c]));
    }
  } catch {
    // None saved yet.
  }
  return new Map();
}

let saveTimer = null;
function save() {
  if (!CHAT_FILE || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${CHAT_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ conversations: [...conversations.values()] }));
      fs.renameSync(tmp, CHAT_FILE);
    } catch (err) {
      console.error("[chat] could not save:", err.message);
    }
  }, 500);
}

class ChatError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

function push(username, event, data) {
  for (const res of streams.get(username) ?? []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function conversation(a, b) {
  const k = key(a, b);
  let c = conversations.get(k);
  if (!c) {
    c = { users: /** @type {[string, string]} */ ([a, b].sort()), messages: [], read: {} };
    conversations.set(k, c);
  }
  return c;
}

/**
 * Adds a message from `from` to `to`, and tells both of them (all their open apps).
 * @param {Omit<Message, "id" | "from" | "at">} content
 */
export function postMessage(from, to, content) {
  const c = conversation(from, to);
  const message = { id: crypto.randomBytes(8).toString("hex"), from, at: Date.now(), ...content };
  c.messages.push(message);
  if (c.messages.length > MAX_KEPT) c.messages.splice(0, c.messages.length - MAX_KEPT);
  // Writing to someone means you've read what came before.
  c.read[from] = message.at;
  save();
  push(to, "message", { with: from, message });
  push(from, "message", { with: to, message });
  return message;
}

function unread(c, username) {
  const since = c.read[username] ?? 0;
  return c.messages.filter((m) => m.from !== username && m.at > since).length;
}

function openStream(req, res, username) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // tell nginx not to buffer the stream
  });
  res.write("retry: 3000\n\n");
  const set = streams.get(username) ?? new Set();
  set.add(res);
  streams.set(username, set);
  req.on("close", () => {
    set.delete(res);
    if (!set.size) streams.delete(username);
  });
}

// Keep the streams alive through proxies.
setInterval(() => {
  for (const set of streams.values()) for (const res of set) res.write(": ping\n\n");
}, HEARTBEAT_MS).unref();

/**
 * Handles /jam-api/chat/* for an authenticated Navidrome user.
 * @param {{ readJson: (req: import("node:http").IncomingMessage) => Promise<any>, isPerson: (username: string) => boolean }} deps
 *   `isPerson`: whether someone has used an app with this server.
 */
export async function handleChat(req, res, url, username, { readJson, isPerson }) {
  try {
    let parts;
    try {
      parts = url.pathname.replace(/^\/jam-api\/chat\/?/, "").replace(/\/$/, "").split("/").map(decodeURIComponent);
    } catch {
      throw new ChatError(400, "Bad address.");
    }
    const [first = "", second] = parts.length === 1 && parts[0] === "" ? [] : parts;

    if (!first) {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
      const list = [...conversations.values()]
        .filter((c) => c.users.includes(username) && c.messages.length)
        .map((c) => ({
          with: c.users[0] === username ? c.users[1] : c.users[0],
          last: c.messages[c.messages.length - 1],
          unread: unread(c, username),
        }))
        .sort((a, b) => b.last.at - a.last.at);
      return json(res, 200, { conversations: list });
    }

    if (first === "events" && !second) {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
      return openStream(req, res, username);
    }

    const other = first;
    if (!USERNAME.test(other) || other === username) throw new ChatError(404, "No such conversation.");

    if (second === "read") {
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
      const c = conversations.get(key(username, other));
      if (c) {
        c.read[username] = Date.now();
        save();
        push(username, "read", { with: other, at: c.read[username] });
      }
      return json(res, 204);
    }
    if (second !== undefined) throw new ChatError(404, "Not found.");

    if (req.method === "GET") {
      const c = conversations.get(key(username, other));
      const before = Number(url.searchParams.get("before")) || Infinity;
      const older = (c?.messages ?? []).filter((m) => m.at < before);
      return json(res, 200, { messages: older.slice(-PAGE), more: older.length > PAGE });
    }

    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
    if (!isPerson(other)) throw new ChatError(404, `${other} hasn't used Spotifion yet.`);
    const body = await readJson(req);
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) throw new ChatError(400, "Write something first.");
    if (text.length > MAX_TEXT) throw new ChatError(400, `Messages are up to ${MAX_TEXT} characters.`);
    return json(res, 200, { message: postMessage(username, other, { kind: "text", text }) });
  } catch (err) {
    if (err instanceof ChatError) return json(res, err.status, { error: err.message });
    throw err;
  }
}
