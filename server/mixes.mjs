// Mixes: a playlist blended from the top songs of a few people, like
// Spotify's Blend. Navidrome only shows play counts to their owner, so each
// member's app works out their own top songs and sends them here (joining a
// mix is agreeing to share them with its members); the server interleaves
// everyone's lists into the mix.
//
//   GET  /jam-api/mixes                    the caller's mixes
//   POST /jam-api/mixes                    { name, tracks } create one (caller is owner)
//   GET  /jam-api/mixes/:id                a mix; non-members only get a preview
//   POST /jam-api/mixes/:id/tracks         { tracks } join, or refresh your top songs
//   POST /jam-api/mixes/:id/playlist       { playlistId } the owner's Navidrome copy
//   POST /jam-api/mixes/:id/leave          leave it (the owner's leaving deletes it)
//
// Mixes are saved in $JAM_DATA_DIR/mixes.json when it's set, else they only
// last until the server restarts.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = process.env.JAM_DATA_DIR || "";
const MIXES_FILE = DATA_DIR ? path.join(DATA_DIR, "mixes.json") : "";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const MAX_MEMBERS = 10;
const MAX_TRACKS_PER_MEMBER = 50;
const MAX_MIX_LENGTH = 100;
const MAX_MIXES_PER_USER = 20;
const MAX_NAME = 60;
/** Songs several members have in common open the mix, at most this many. */
const MAX_SHARED_FIRST = 20;

const TRACK_FIELDS = {
  id: "string",
  title: "string",
  artist: "string",
  artistId: "string",
  album: "string",
  albumId: "string",
  coverArt: "string",
  duration: "number",
};

/**
 * @typedef {Record<string, string | number>} Track
 * @typedef {{ tracks: Track[], updatedAt: number }} Contribution
 * @typedef {{
 *   id: string, name: string, owner: string, createdAt: number,
 *   members: Record<string, Contribution>, playlistId: string | null,
 * }} Mix
 */

/** @type {Map<string, Mix>} */
const mixes = loadMixes();

class MixError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function loadMixes() {
  try {
    if (MIXES_FILE) {
      const saved = JSON.parse(fs.readFileSync(MIXES_FILE, "utf8"));
      if (Array.isArray(saved)) return new Map(saved.map((m) => [m.id, m]));
    }
  } catch {
    // None saved yet.
  }
  return new Map();
}

let saveTimer = null;
/** False once a save failed (e.g. JAM_DATA_DIR isn't writable): mixes then only last until a restart. */
let saving = Boolean(MIXES_FILE);
/** Writes the mixes out soon after a change (one write for a burst of changes). */
function save() {
  if (!MIXES_FILE || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${MIXES_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...mixes.values()]));
      fs.renameSync(tmp, MIXES_FILE);
      saving = true;
    } catch (err) {
      console.error("[mixes] could not save:", err.message);
      saving = false;
    }
  }, 500);
}

function newCode() {
  for (;;) {
    const code = Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    if (!mixes.has(code)) return code;
  }
}

function sanitizeTracks(tracks) {
  if (!Array.isArray(tracks)) return [];
  const seen = new Set();
  const clean = [];
  for (const t of tracks) {
    if (clean.length >= MAX_TRACKS_PER_MEMBER) break;
    if (!t || typeof t.id !== "string" || typeof t.title !== "string" || seen.has(t.id)) continue;
    seen.add(t.id);
    const track = {};
    for (const [key, type] of Object.entries(TRACK_FIELDS)) {
      if (typeof t[key] === type) track[key] = type === "string" ? t[key].slice(0, 500) : t[key];
    }
    clean.push(track);
  }
  return clean;
}

function cleanName(value) {
  return String(value ?? "").trim().slice(0, MAX_NAME);
}

/**
 * Blends the members' lists (each in their own order, top songs first): songs
 * several of them have open the mix, then everyone takes turns, so each
 * member gets about the same share.
 * @returns {{ track: Track, from: string[] }[]}
 */
function blend(mix) {
  /** @type {Map<string, { track: Track, from: string[], rankSum: number }>} */
  const byId = new Map();
  const usernames = Object.keys(mix.members).sort();
  for (const username of usernames) {
    mix.members[username].tracks.forEach((track, rank) => {
      const entry = byId.get(track.id);
      if (entry) {
        entry.from.push(username);
        entry.rankSum += rank;
      } else {
        byId.set(track.id, { track, from: [username], rankSum: rank });
      }
    });
  }

  const out = [];
  const used = new Set();
  const add = (entry) => {
    used.add(entry.track.id);
    out.push({ track: entry.track, from: entry.from });
  };

  if (usernames.length > 1) {
    const shared = [...byId.values()]
      .filter((e) => e.from.length > 1)
      .sort((a, b) => b.from.length - a.from.length || a.rankSum - b.rankSum);
    for (const entry of shared.slice(0, MAX_SHARED_FIRST)) add(entry);
  }

  // Take turns, starting with a different member each time the mix changes
  // (seeded by the mix id, so it doesn't reshuffle on every look).
  const lists = usernames.map((u) => mix.members[u].tracks);
  const start = lists.length ? parseInt(crypto.createHash("sha1").update(mix.id).digest("hex").slice(0, 8), 16) % lists.length : 0;
  const cursors = lists.map(() => 0);
  while (out.length < MAX_MIX_LENGTH) {
    let progressed = false;
    for (let k = 0; k < lists.length && out.length < MAX_MIX_LENGTH; k++) {
      const i = (start + k) % lists.length;
      const list = lists[i];
      while (cursors[i] < list.length && used.has(list[cursors[i]].id)) cursors[i]++;
      if (cursors[i] < list.length) {
        add(byId.get(list[cursors[i]].id));
        cursors[i]++;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return out;
}

function memberList(mix) {
  return Object.entries(mix.members).map(([username, c]) => ({
    username,
    songCount: c.tracks.length,
    updatedAt: c.updatedAt,
  }));
}

function summary(mix) {
  return {
    id: mix.id,
    name: mix.name,
    owner: mix.owner,
    members: memberList(mix),
    updatedAt: Math.max(mix.createdAt, ...Object.values(mix.members).map((c) => c.updatedAt)),
  };
}

function fullView(mix) {
  return { ...summary(mix), playlistId: mix.playlistId, tracks: blend(mix) };
}

function getMix(id) {
  const mix = mixes.get(id);
  if (!mix) throw new MixError(404, "This mix doesn't exist any more.");
  return mix;
}

/** What an invite to this mix shows, or null if it's gone (for invites.mjs). */
export function mixForInvite(id) {
  const mix = mixes.get(id);
  return mix ? { name: mix.name, members: Object.keys(mix.members) } : null;
}

function requireMember(mix, username) {
  if (!mix.members[username]) throw new MixError(403, "You're not in this mix.");
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

/**
 * Handles /jam-api/mixes/* for an authenticated Navidrome user.
 * @param {(req: import("node:http").IncomingMessage) => Promise<any>} readJson
 */
export async function handleMixes(req, res, url, username, { readJson }) {
  try {
    await route(req, res, url, username, readJson);
  } catch (err) {
    if (!(err instanceof MixError)) throw err;
    json(res, err.status, { error: err.message });
  }
}

async function route(req, res, url, username, readJson) {
  const match = url.pathname.match(/^\/jam-api\/mixes(?:\/([A-Z0-9]{6})(?:\/(tracks|playlist|leave))?)?\/?$/);
  if (!match) throw new MixError(404, "Not found.");
  const [, id, sub] = match;

  if (!id) {
    if (req.method === "GET") {
      const mine = [...mixes.values()]
        .filter((m) => m.members[username])
        .map((m) => ({ ...summary(m), covers: blend(m).slice(0, 8).map((e) => e.track.coverArt) }));
      mine.sort((a, b) => b.updatedAt - a.updatedAt);
      return json(res, 200, { mixes: mine, persisted: saving });
    }
    if (req.method !== "POST") throw new MixError(405, "Method not allowed.");
    const body = await readJson(req);
    const owned = [...mixes.values()].filter((m) => m.owner === username).length;
    if (owned >= MAX_MIXES_PER_USER) throw new MixError(400, `You can make up to ${MAX_MIXES_PER_USER} mixes.`);
    const now = Date.now();
    const mix = {
      id: newCode(),
      name: cleanName(body.name) || `${username}'s mix`,
      owner: username,
      createdAt: now,
      members: { [username]: { tracks: sanitizeTracks(body.tracks), updatedAt: now } },
      playlistId: null,
    };
    mixes.set(mix.id, mix);
    save();
    console.log(`[mixes] ${username} created mix ${mix.id}`);
    return json(res, 201, fullView(mix));
  }

  const mix = getMix(id);

  if (!sub) {
    if (req.method !== "GET") throw new MixError(405, "Method not allowed.");
    // The code lets anyone on the server see who's in it, but only members see the songs.
    return json(res, 200, mix.members[username] ? fullView(mix) : summary(mix));
  }

  if (req.method !== "POST") throw new MixError(405, "Method not allowed.");
  const body = await readJson(req);

  if (sub === "tracks") {
    if (!mix.members[username] && Object.keys(mix.members).length >= MAX_MEMBERS) {
      throw new MixError(400, `A mix can have up to ${MAX_MEMBERS} people.`);
    }
    const joining = !mix.members[username];
    mix.members[username] = { tracks: sanitizeTracks(body.tracks), updatedAt: Date.now() };
    save();
    if (joining) console.log(`[mixes] ${username} joined mix ${mix.id}`);
    return json(res, 200, fullView(mix));
  }

  if (sub === "playlist") {
    if (mix.owner !== username) throw new MixError(403, "Only the mix's creator can do that.");
    mix.playlistId = typeof body.playlistId === "string" && body.playlistId ? body.playlistId.slice(0, 100) : null;
    save();
    return json(res, 200, fullView(mix));
  }

  // sub === "leave"
  requireMember(mix, username);
  if (mix.owner === username) {
    mixes.delete(mix.id);
    console.log(`[mixes] ${username} deleted mix ${mix.id}`);
  } else {
    delete mix.members[username];
  }
  save();
  return json(res, 204);
}
