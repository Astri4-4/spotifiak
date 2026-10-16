// Scoreboard: who listened the most this week, and the artists friends have
// in common. Weeks start on Monday at midnight, in the server's time zone (TZ).
//
// The app reports each song once it's half played (when it scrobbles it to
// Navidrome), only while "Share what I'm listening to" is on. The server
// looks the song up in Navidrome with the caller's own credentials, so only
// real songs count, at their real length.
//
//   GET  /jam-api/scoreboard               this week's board (see board())
//   POST /jam-api/scoreboard/plays         { id } - a Navidrome song id
//   POST /jam-api/scoreboard/leave         drop your plays this week
//
// Kept in $JAM_DATA_DIR/scoreboard.json when set, else until the server restarts.

import fs from "node:fs";
import path from "node:path";
import { byName } from "./names.mjs";

const DATA_DIR = process.env.JAM_DATA_DIR || "";
const DATA_FILE = DATA_DIR ? path.join(DATA_DIR, "scoreboard.json") : "";
const SAVE_DELAY_MS = 5_000;
const NAVIDROME_TIMEOUT_MS = 8_000;
const MAX_COMMON = 20;
const TOP_ARTISTS = 3;
/** Two reports closer together than this share of the songs' halves are the same play (two devices, a Jam). */
const MIN_GAP_SHARE = 0.8;

/**
 * @typedef {{ name: string, id: string, seconds: number, plays: number }} ArtistTally
 * @typedef {{
 *   seconds: number, plays: number, artists: Record<string, ArtistTally>,
 *   last: { id: string, at: number, duration: number } | null,
 * }} UserWeek
 */

/** @type {{ weekStart: number, users: Record<string, UserWeek> }} */
let week = { weekStart: weekStart(), users: {} };
let saveTimer = null;

/** Monday 00:00 of the current week, local time, in ms since epoch. */
function weekStart(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function load() {
  if (!DATA_FILE) return;
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (saved?.weekStart === week.weekStart && saved.users && typeof saved.users === "object") {
      // The same person under two spellings: their week's listening added up.
      saved.users = Object.fromEntries(
        byName(Object.entries(saved.users), (kept, other) => {
          const artists = { ...other.artists };
          for (const [k, a] of Object.entries(kept.artists)) {
            const b = artists[k];
            artists[k] = b ? { ...a, seconds: a.seconds + b.seconds, plays: a.plays + b.plays } : a;
          }
          const last = !kept.last || (other.last && other.last.at > kept.last.at) ? other.last : kept.last;
          return { seconds: kept.seconds + other.seconds, plays: kept.plays + other.plays, artists, last };
        }),
      );
      week = saved;
    }
  } catch {
    // Nothing saved yet, or unreadable: start the week empty.
  }
}

function save() {
  if (!DATA_FILE || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(week));
    } catch (err) {
      console.error("[scoreboard] could not save:", err.message);
    }
  }, SAVE_DELAY_MS);
  saveTimer.unref();
}

/** The current week, starting a new one when Monday comes. */
function current() {
  const start = weekStart();
  if (week.weekStart !== start) {
    week = { weekStart: start, users: {} };
    save();
  }
  return week;
}

load();

class ScoreboardError extends Error {
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
    throw new ScoreboardError(502, "Couldn't reach Navidrome.");
  }
  const root = data?.["subsonic-response"];
  if (root?.status !== "ok" || !root.song) throw new ScoreboardError(404, "That song isn't in the library.");
  return root.song;
}

function recordPlay(username, song) {
  const duration = Number(song.duration) > 0 ? Number(song.duration) : 0;
  if (!duration) return false;
  const users = current().users;
  const user = (users[username] ??= { seconds: 0, plays: 0, artists: {}, last: null });

  const now = Date.now();
  if (user.last) {
    const gap = (now - user.last.at) / 1000;
    if (gap < MIN_GAP_SHARE * (user.last.duration / 2 + duration / 2)) return false;
  }
  user.last = { id: String(song.id), at: now, duration };
  user.seconds += duration;
  user.plays += 1;

  const name = typeof song.artist === "string" && song.artist.trim() ? song.artist.trim() : "";
  if (name) {
    const id = typeof song.artistId === "string" ? song.artistId : "";
    const key = id || `name:${name.toLowerCase()}`;
    const artist = (user.artists[key] ??= { name, id, seconds: 0, plays: 0 });
    artist.seconds += duration;
    artist.plays += 1;
  }
  save();
  return true;
}

/**
 * This week's board: everyone who listened, most listening time first, each
 * with their top artists; and the artists at least two of them listened to,
 * shared by the most people first.
 */
function board() {
  const { weekStart: start, users } = current();
  const ranked = Object.entries(users)
    .map(([username, u]) => ({
      username,
      seconds: u.seconds,
      plays: u.plays,
      topArtists: Object.values(u.artists)
        .sort((a, b) => b.seconds - a.seconds)
        .slice(0, TOP_ARTISTS)
        .map(({ name, id, plays }) => ({ name, id, plays })),
    }))
    .sort((a, b) => b.seconds - a.seconds || a.username.localeCompare(b.username));

  /** @type {Map<string, { name: string, id: string, plays: number, listeners: string[] }>} */
  const byArtist = new Map();
  for (const [username, u] of Object.entries(users)) {
    for (const [key, a] of Object.entries(u.artists)) {
      const entry = byArtist.get(key) ?? { name: a.name, id: a.id, plays: 0, listeners: [] };
      entry.plays += a.plays;
      entry.listeners.push(username);
      byArtist.set(key, entry);
    }
  }
  const common = [...byArtist.values()]
    .filter((a) => a.listeners.length > 1)
    .sort((a, b) => b.listeners.length - a.listeners.length || b.plays - a.plays)
    .slice(0, MAX_COMMON);

  return { weekStart: start, users: ranked, common };
}

export async function handleScoreboard(req, res, url, username, { navidromeUrl, readJson }) {
  const sub = url.pathname.replace(/^\/jam-api\/scoreboard\/?/, "").replace(/\/$/, "");
  try {
    if (sub === "") {
      if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
      return json(res, 200, board());
    }
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });

    if (sub === "plays") {
      const body = await readJson(req);
      if (typeof body.id !== "string" || !body.id || body.id.length > 200) {
        return json(res, 400, { error: "Missing song id." });
      }
      const song = await getSong(navidromeUrl, url.searchParams, body.id);
      return json(res, 200, { counted: recordPlay(username, song) });
    }

    if (sub === "leave") {
      const users = current().users;
      if (users[username]) {
        delete users[username];
        save();
      }
      return json(res, 204);
    }

    return json(res, 404, { error: "Not found." });
  } catch (err) {
    if (err instanceof ScoreboardError) return json(res, err.status, { error: err.message });
    throw err;
  }
}
