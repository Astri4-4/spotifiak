// Stream counts: how many times each song, album and artist was played, by
// everyone on the server, like Spotify's play counts. (Navidrome only knows
// each person's own plays.)
//
// The app reports a song once it's half played. A song played in a Jam counts
// once, however many people are listening: every member reports it with the
// Jam's code and the queue item, and only the first report counts.
//
//   GET  /jam-api/streams?songs=a,b&albums=c&artists=d    { songs: {a: n}, albums: {...}, artists: {...} }
//   POST /jam-api/streams/plays            { id, jam?: { id, uid } } - a Navidrome song id
//
// Kept in $JAM_DATA_DIR/streams.json when set, else until the server restarts.

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.JAM_DATA_DIR || "";
const DATA_FILE = DATA_DIR ? path.join(DATA_DIR, "streams.json") : "";
const SAVE_DELAY_MS = 5_000;
const NAVIDROME_TIMEOUT_MS = 8_000;
const MAX_IDS = 500;
/** Two reports from one person closer together than this share of the songs' halves are the same play (two devices). */
const MIN_GAP_SHARE = 0.8;
/** How long a Jam's counted queue items are remembered. */
const JAM_PLAY_TTL_MS = 24 * 60 * 60 * 1000;

/** @type {{ songs: Record<string, number>, albums: Record<string, number>, artists: Record<string, number> }} */
let counts = load();
let saveTimer = null;
/** @type {Map<string, { id: string, at: number, duration: number }>} each person's last counted play */
const lastPlay = new Map();
/** @type {Map<string, number>} "jamId:uid" of the Jam songs already counted, and when */
const jamPlays = new Map();

function load() {
  const empty = { songs: {}, albums: {}, artists: {} };
  if (!DATA_FILE) return empty;
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    for (const key of Object.keys(empty)) if (saved?.[key] && typeof saved[key] === "object") empty[key] = saved[key];
  } catch {
    // Nothing saved yet, or unreadable: start from zero.
  }
  return empty;
}

function save() {
  if (!DATA_FILE || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(counts));
    } catch (err) {
      console.error("[streams] could not save:", err.message);
    }
  }, SAVE_DELAY_MS);
  saveTimer.unref();
}

class StreamsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

/** The song, as the caller sees it in Navidrome. */
async function getSong(navidromeUrl, auth, id) {
  const query = new URLSearchParams({
    u: auth.get("u"),
    t: auth.get("t"),
    s: auth.get("s"),
    v: "1.16.1",
    c: "spotifion-jam",
    f: "json",
    id,
  });
  let data;
  try {
    const res = await fetch(`${navidromeUrl}/rest/getSong?${query}`, { signal: AbortSignal.timeout(NAVIDROME_TIMEOUT_MS) });
    data = await res.json();
  } catch {
    throw new StreamsError(502, "Couldn't reach Navidrome.");
  }
  const root = data?.["subsonic-response"];
  if (root?.status !== "ok" || !root.song) throw new StreamsError(404, "That song isn't in the library.");
  return root.song;
}

/** Everyone credited on the song: its artists (featured ones too) and its album's. */
function artistIds(song) {
  const ids = new Set();
  if (typeof song.artistId === "string" && song.artistId) ids.add(song.artistId);
  for (const list of [song.artists, song.albumArtists]) {
    if (!Array.isArray(list)) continue;
    for (const a of list) if (typeof a?.id === "string" && a.id) ids.add(a.id);
  }
  return ids;
}

function forgetOldJamPlays(now) {
  for (const [key, at] of jamPlays) if (now - at > JAM_PLAY_TTL_MS) jamPlays.delete(key);
}

/** Counts the play; false when it was already counted (another Jam member, another device). */
function recordPlay(username, song, jamKey) {
  const now = Date.now();
  const duration = Number(song.duration) > 0 ? Number(song.duration) : 0;
  if (jamKey) {
    forgetOldJamPlays(now);
    if (jamPlays.has(jamKey)) return false;
    jamPlays.set(jamKey, now);
  } else {
    const last = lastPlay.get(username);
    if (last && last.id === String(song.id) && (now - last.at) / 1000 < MIN_GAP_SHARE * duration) return false;
  }
  lastPlay.set(username, { id: String(song.id), at: now, duration });

  const id = String(song.id);
  counts.songs[id] = (counts.songs[id] ?? 0) + 1;
  if (typeof song.albumId === "string" && song.albumId) counts.albums[song.albumId] = (counts.albums[song.albumId] ?? 0) + 1;
  for (const artist of artistIds(song)) counts.artists[artist] = (counts.artists[artist] ?? 0) + 1;
  save();
  return true;
}

function pick(table, list) {
  const out = {};
  if (!list) return out;
  for (const id of list.split(",").slice(0, MAX_IDS)) if (id) out[id] = table[id] ?? 0;
  return out;
}

/**
 * @param {{ navidromeUrl: string, readJson: (req) => Promise<any>, isJamSong: (jamId: string, uid: string, username: string) => boolean }} deps
 *   `isJamSong`: whether that queue item is in that Jam, and the caller is listening to it.
 */
export async function handleStreams(req, res, url, username, { navidromeUrl, readJson, isJamSong }) {
  const sub = url.pathname.replace(/^\/jam-api\/streams\/?/, "").replace(/\/$/, "");
  try {
    if (sub === "") {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
      const q = url.searchParams;
      return json(res, 200, {
        songs: pick(counts.songs, q.get("songs")),
        albums: pick(counts.albums, q.get("albums")),
        artists: pick(counts.artists, q.get("artists")),
      });
    }

    if (sub === "plays") {
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
      const body = await readJson(req);
      if (typeof body.id !== "string" || !body.id || body.id.length > 200) {
        return json(res, 400, { error: "Missing song id." });
      }
      let jamKey = null;
      if (body.jam != null) {
        const { id, uid } = body.jam;
        if (typeof id !== "string" || typeof uid !== "string" || !isJamSong(id, uid, username)) {
          return json(res, 400, { error: "That song isn't playing in your Jam." });
        }
        jamKey = `${id}:${uid}`;
      }
      const song = await getSong(navidromeUrl, url.searchParams, body.id);
      return json(res, 200, { counted: recordPlay(username, song, jamKey) });
    }

    return json(res, 404, { error: "Not found." });
  } catch (err) {
    if (err instanceof StreamsError) return json(res, err.status, { error: err.message });
    throw err;
  }
}
