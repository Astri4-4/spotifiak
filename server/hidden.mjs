// Hidden duplicates: each person's list of the extra copies of songs they
// don't want to see (the same song from a single, a compilation, a
// downloaded playlist's folder...), with the copy they keep. Apps hide a
// copy wherever the one kept is shown too, and albums made only of hidden
// copies. Nothing changes in the library: files and everyone's playlists
// stay as they are.
//
//   GET  /jam-api/hidden          { songs: { [id]: keptId }, albums: [id] }
//   POST /jam-api/hidden          { songs?: { [id]: keptId }, albums?: [id] } hides more
//   POST /jam-api/hidden/show     { songs?: [id], albums?: [id] } or { all: true } shows them again
//
// Saved in $JAM_DATA_DIR/hidden.json when it's set, else they only last
// until the server restarts.

import fs from "node:fs";
import path from "node:path";
import { byName } from "./names.mjs";

const DATA_DIR = process.env.JAM_DATA_DIR || "";
const HIDDEN_FILE = DATA_DIR ? path.join(DATA_DIR, "hidden.json") : "";
const MAX_SONGS = 20_000;
const MAX_ALBUMS = 5_000;
const MAX_ID = 100;

/** By username. @type {Map<string, { songs: Record<string, string>, albums: string[] }>} */
const hidden = load();

class HiddenError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function load() {
  try {
    if (HIDDEN_FILE) {
      return byName(Object.entries(JSON.parse(fs.readFileSync(HIDDEN_FILE, "utf8"))), (kept, other) => ({
        songs: { ...other.songs, ...kept.songs },
        albums: [...new Set([...kept.albums, ...other.albums])],
      }));
    }
  } catch {
    // None saved yet.
  }
  return new Map();
}

let saveTimer = null;
/** False once a save failed (e.g. JAM_DATA_DIR isn't writable). */
let saving = Boolean(HIDDEN_FILE);
/** Writes everything out soon after a change (one write for a burst of changes). */
function save() {
  if (!HIDDEN_FILE || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${HIDDEN_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(hidden)));
      fs.renameSync(tmp, HIDDEN_FILE);
      saving = true;
    } catch (err) {
      console.error("[hidden] could not save:", err.message);
      saving = false;
    }
  }, 500);
}

const isId = (v) => typeof v === "string" && v.length > 0 && v.length <= MAX_ID && v !== "__proto__";
const ids = (v) => (Array.isArray(v) ? v.filter(isId) : []);

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/**
 * Handles /jam-api/hidden/* for an authenticated Navidrome user.
 * @param {{ readJson: (req: import("node:http").IncomingMessage) => Promise<any> }} deps
 */
export async function handleHidden(req, res, url, username, { readJson }) {
  try {
    await route(req, res, url, username, readJson);
  } catch (err) {
    if (!(err instanceof HiddenError)) throw err;
    json(res, err.status, { error: err.message });
  }
}

async function route(req, res, url, username, readJson) {
  const sub = url.pathname.replace(/^\/jam-api\/hidden\/?/, "").replace(/\/$/, "");
  if (sub !== "" && sub !== "show") throw new HiddenError(404, "Not found.");
  const mine = hidden.get(username) ?? { songs: {}, albums: [] };
  const reply = () => json(res, 200, { ...mine, persisted: saving });

  if (req.method === "GET" && sub === "") return reply();
  if (req.method !== "POST") throw new HiddenError(405, "Method not allowed.");
  const body = await readJson(req);

  if (sub === "show") {
    if (body.all === true) {
      mine.songs = {};
      mine.albums = [];
    } else {
      for (const id of ids(body.songs)) delete mine.songs[id];
      const albums = new Set(ids(body.albums));
      mine.albums = mine.albums.filter((a) => !albums.has(a));
    }
  } else {
    const songs = body.songs && typeof body.songs === "object" ? Object.entries(body.songs) : [];
    for (const [id, kept] of songs) {
      if (isId(id) && isId(kept) && id !== kept) mine.songs[id] = kept;
    }
    // A copy kept earlier can be hidden now: what pointed at it points at the new one.
    for (const [id, kept] of Object.entries(mine.songs)) {
      if (mine.songs[kept]) mine.songs[id] = mine.songs[kept];
      if (mine.songs[id] === id) delete mine.songs[id];
    }
    mine.albums = [...new Set([...mine.albums, ...ids(body.albums)])];
    if (Object.keys(mine.songs).length > MAX_SONGS || mine.albums.length > MAX_ALBUMS) {
      throw new HiddenError(400, "That's too many hidden songs.");
    }
  }

  if (Object.keys(mine.songs).length || mine.albums.length) hidden.set(username, mine);
  else hidden.delete(username);
  save();
  return reply();
}
