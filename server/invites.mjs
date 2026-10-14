// Invitations sent inside the app: to a Jam or a mix, to other people of the
// Navidrome server, who see them in their inbox and join with a tap - no link
// to pass around.
//
//   GET  /jam-api/invites                  { received, sent } the caller's pending invites
//   GET  /jam-api/invites/people           { people } who can be invited
//   POST /jam-api/invites                  { kind: "jam" | "mix", code, to: [usernames] }
//   POST /jam-api/invites/:id/dismiss      the recipient declines (or has joined)
//
// "People" are everyone who has used an app with this server, since
// Navidrome only lists its users to admins. Invites last until they're
// answered, what they're for ends, or a week has passed.
//
// Saved in $JAM_DATA_DIR/invites.json when it's set, else they only last
// until the server restarts.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.JAM_DATA_DIR || "";
const INVITES_FILE = DATA_DIR ? path.join(DATA_DIR, "invites.json") : "";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECIPIENTS = 20;
const MAX_PENDING_PER_USER = 50;
const KINDS = ["jam", "mix"];

/**
 * @typedef {{ id: string, kind: "jam" | "mix", code: string, name: string, from: string, to: string, at: number }} Invite
 * @typedef {(kind: "jam" | "mix", code: string) => { name: string, members: string[] } | null} Lookup
 *   What an invite is for (a Jam's name is its host's), or null once it's over.
 */

const { invites, people } = load();

class InviteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function load() {
  try {
    if (INVITES_FILE) {
      const saved = JSON.parse(fs.readFileSync(INVITES_FILE, "utf8"));
      return {
        /** @type {Map<string, Invite>} */
        invites: new Map((saved.invites ?? []).map((i) => [i.id, i])),
        /** @type {Set<string>} */
        people: new Set(saved.people ?? []),
      };
    }
  } catch {
    // None saved yet.
  }
  return { invites: new Map(), people: new Set() };
}

let saveTimer = null;
/** Writes everything out soon after a change (one write for a burst of changes). */
function save() {
  if (!INVITES_FILE || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${INVITES_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ invites: [...invites.values()], people: [...people] }));
      fs.renameSync(tmp, INVITES_FILE);
    } catch (err) {
      console.error("[invites] could not save:", err.message);
    }
  }, 500);
}

/** Remembers someone who signed in, so others can invite them. */
export function rememberPerson(username) {
  if (people.has(username)) return;
  people.add(username);
  save();
}

/** Drops invites that are answered in effect (they joined), over, or too old. */
function prune(lookup) {
  const now = Date.now();
  let changed = false;
  for (const invite of invites.values()) {
    const target = lookup(invite.kind, invite.code);
    if (!target || target.members.includes(invite.to) || now - invite.at > MAX_AGE_MS) {
      invites.delete(invite.id);
      changed = true;
    }
  }
  if (changed) save();
}

const view = ({ id, kind, code, name, from, to, at }) => ({ id, kind, code, name, from, to, at });

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

/**
 * Handles /jam-api/invites/* for an authenticated Navidrome user.
 * @param {{ readJson: (req: import("node:http").IncomingMessage) => Promise<any>, lookup: Lookup }} deps
 */
export async function handleInvites(req, res, url, username, deps) {
  try {
    await route(req, res, url, username, deps);
  } catch (err) {
    if (!(err instanceof InviteError)) throw err;
    json(res, err.status, { error: err.message });
  }
}

async function route(req, res, url, username, { readJson, lookup }) {
  const match = url.pathname.match(/^\/jam-api\/invites(?:\/(people|[0-9a-f]{16}\/dismiss))?\/?$/);
  if (!match) throw new InviteError(404, "Not found.");
  const [, sub] = match;

  if (sub === "people") {
    if (req.method !== "GET") throw new InviteError(405, "Method not allowed.");
    const others = [...people].filter((p) => p !== username).sort((a, b) => a.localeCompare(b));
    return json(res, 200, { people: others });
  }

  if (sub) {
    if (req.method !== "POST") throw new InviteError(405, "Method not allowed.");
    const invite = invites.get(sub.slice(0, 16));
    // Already gone is fine: it was answered on another device.
    if (invite && invite.to === username) {
      invites.delete(invite.id);
      save();
    }
    return json(res, 204);
  }

  if (req.method === "GET") {
    prune(lookup);
    const all = [...invites.values()].sort((a, b) => b.at - a.at);
    return json(res, 200, {
      received: all.filter((i) => i.to === username).map(view),
      sent: all.filter((i) => i.from === username).map(view),
    });
  }

  if (req.method !== "POST") throw new InviteError(405, "Method not allowed.");
  const body = await readJson(req);
  const kind = body.kind;
  const code = typeof body.code === "string" ? body.code : "";
  if (!KINDS.includes(kind) || !code) throw new InviteError(400, "Invite to what?");
  const target = lookup(kind, code);
  if (!target) throw new InviteError(404, kind === "jam" ? "This Jam has ended." : "This mix doesn't exist any more.");
  if (!target.members.includes(username)) {
    throw new InviteError(403, kind === "jam" ? "Join the Jam to invite people." : "Join the mix to invite people.");
  }

  const to = [...new Set(Array.isArray(body.to) ? body.to.filter((u) => typeof u === "string") : [])];
  if (!to.length) throw new InviteError(400, "Invite whom?");
  if (to.length > MAX_RECIPIENTS) throw new InviteError(400, `You can invite up to ${MAX_RECIPIENTS} people at once.`);
  const unknown = to.find((u) => !people.has(u));
  if (unknown) throw new InviteError(400, `${unknown} hasn't used Spotifion yet.`);

  const sent = [];
  for (const recipient of to) {
    if (recipient === username || target.members.includes(recipient)) continue;
    // Invited again: the same invite moves back to the top.
    const existing = [...invites.values()].find((i) => i.kind === kind && i.code === code && i.to === recipient);
    if (existing) {
      existing.from = username;
      existing.at = Date.now();
      sent.push(recipient);
      continue;
    }
    const pending = [...invites.values()].filter((i) => i.to === recipient);
    if (pending.length >= MAX_PENDING_PER_USER) {
      // Their oldest one makes room.
      invites.delete(pending.reduce((a, b) => (a.at < b.at ? a : b)).id);
    }
    const invite = {
      id: crypto.randomBytes(8).toString("hex"),
      kind,
      code,
      name: target.name,
      from: username,
      to: recipient,
      at: Date.now(),
    };
    invites.set(invite.id, invite);
    sent.push(recipient);
  }
  save();
  if (sent.length) console.log(`[invites] ${username} invited ${sent.join(", ")} to ${kind} ${code}`);
  return json(res, 200, { sent });
}
