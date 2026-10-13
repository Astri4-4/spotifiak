// Remove duplicates: for the songs of an album or playlist, finds the other
// files of the same song in the library (same title and artist, about the
// same length) and moves all but the best copy into a hidden trash folder of
// the music share, which Navidrome ignores. Nothing is deleted: empty
// MUSIC_DIR/.spotifion-trash when sure, or move files back to undo.
//
// The best copy: an album track (deemix and Lidarr name them "01 - Title"),
// else a single (at the top of deemix's download folder), else one in a
// downloaded playlist's folder; then the highest bitrate.
//
//   GET  /jam-api/duplicates/config   { available }
//   POST /jam-api/duplicates          { kind: "album" | "playlist", id, apply }
//                                     apply false: what would be moved; true: move it
//
// Needs the music share mounted read-write at MUSIC_DIR, and Navidrome
// reporting real file paths (ND_SUBSONIC_DEFAULTREPORTREALPATH=true), so its
// songs can be matched to files. Navidrome is called with the caller's own
// credentials, so they only reach albums and playlists they can see.

import fs from "node:fs";
import path from "node:path";

const MUSIC_DIR = process.env.MUSIC_DIR ? path.resolve(process.env.MUSIC_DIR) : "";
/** deemix's download folder within MUSIC_DIR ("" if it's MUSIC_DIR itself): its singles are at its top. */
const DEEMIX_FOLDER = (process.env.DEEMIX_FOLDER || "").replace(/^\/+|\/+$/g, "");
/** Navidrome's music folder, to turn absolute paths it reports into ones in MUSIC_DIR. */
const NAVIDROME_MUSIC_DIR = (process.env.NAVIDROME_MUSIC_DIR || "/music").replace(/\/+$/, "");
const TRASH = ".spotifion-trash";
const SEARCH_CONCURRENCY = 6;
const MAX_DURATION_DIFF = 2; // seconds
const NAVIDROME_TIMEOUT_MS = 15_000;

/** One clean-up at a time: they move files around. */
let busy = false;

class DuplicatesError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function available() {
  if (!MUSIC_DIR) return false;
  try {
    fs.accessSync(MUSIC_DIR, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// ---- Navidrome, as the caller ----------------------------------------------

function subsonic(navidromeUrl, auth, endpoint, params = {}) {
  const query = new URLSearchParams({
    u: auth.get("u"),
    t: auth.get("t"),
    s: auth.get("s"),
    v: "1.16.1",
    c: "spotifion-jam",
    f: "json",
    ...params,
  });
  return fetch(`${navidromeUrl}/rest/${endpoint}?${query}`, { signal: AbortSignal.timeout(NAVIDROME_TIMEOUT_MS) })
    .then((r) => r.json())
    .then((data) => {
      const root = data?.["subsonic-response"];
      if (root?.status !== "ok") throw new DuplicatesError(404, root?.error?.message ?? "Navidrome refused the request.");
      return root;
    });
}

async function songsOf(navidromeUrl, auth, kind, id) {
  if (kind === "album") return (await subsonic(navidromeUrl, auth, "getAlbum", { id })).album?.song ?? [];
  return (await subsonic(navidromeUrl, auth, "getPlaylist", { id })).playlist?.entry ?? [];
}

const normalise = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function sameSong(a, b) {
  return (
    normalise(a.title) === normalise(b.title) &&
    normalise(a.artist) === normalise(b.artist) &&
    Math.abs((a.duration ?? 0) - (b.duration ?? 0)) <= MAX_DURATION_DIFF
  );
}

/** Every copy of `song` in the library, itself included. */
async function copiesOf(navidromeUrl, auth, song) {
  const found = await subsonic(navidromeUrl, auth, "search3", {
    query: song.title,
    songCount: "50",
    artistCount: "0",
    albumCount: "0",
  });
  const copies = (found.searchResult3?.song ?? []).filter((s) => sameSong(s, song));
  return copies.some((c) => c.id === song.id) ? copies : [song, ...copies];
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

// ---- files --------------------------------------------------------------------

/** The file of a song, as a path relative to MUSIC_DIR; null if Navidrome's path isn't a real one. */
function fileOf(song) {
  let p = String(song.path ?? "");
  if (path.isAbsolute(p)) {
    if (!p.startsWith(`${NAVIDROME_MUSIC_DIR}/`)) return null;
    p = p.slice(NAVIDROME_MUSIC_DIR.length + 1);
  }
  const full = path.resolve(MUSIC_DIR, p);
  // Never outside the share, nor in the trash.
  if (!full.startsWith(`${MUSIC_DIR}/`) || p.split("/")[0] === TRASH) return null;
  return fs.existsSync(full) ? p : null;
}

/** Lower is better: album track, then single, then a playlist folder's copy. */
function rank(file) {
  if (/^\d+\s*-\s/.test(path.basename(file))) return 0;
  if (path.dirname(file) === (DEEMIX_FOLDER || ".")) return 1;
  return 2;
}

function best(a, b) {
  return (
    rank(a.file) - rank(b.file) ||
    (b.song.bitRate ?? 0) - (a.song.bitRate ?? 0) ||
    a.file.length - b.file.length ||
    a.file.localeCompare(b.file)
  );
}

/** Groups of copies of the same song: which to keep, which to move away. */
async function plan(navidromeUrl, auth, kind, id) {
  const songs = await songsOf(navidromeUrl, auth, kind, id);
  if (songs.length && songs.every((s) => fileOf(s) === null)) {
    throw new DuplicatesError(
      409,
      "Navidrome doesn't report its songs' real files. Set ND_SUBSONIC_DEFAULTREPORTREALPATH=true on it.",
    );
  }
  // A song can be in a playlist twice; look it up once.
  const unique = [...new Map(songs.map((s) => [s.id, s])).values()];
  const found = await mapLimit(unique, SEARCH_CONCURRENCY, (s) => copiesOf(navidromeUrl, auth, s));

  const groups = [];
  const seen = new Set();
  for (const copies of found) {
    const withFiles = copies.map((song) => ({ song, file: fileOf(song) })).filter((c) => c.file !== null);
    // Same file reached twice (e.g. two copies listed in this playlist): count it once.
    const byFile = [...new Map(withFiles.map((c) => [c.file, c])).values()];
    if (byFile.length < 2 || byFile.some((c) => seen.has(c.file))) continue;
    byFile.sort(best);
    for (const c of byFile) seen.add(c.file);
    const [keep, ...remove] = byFile;
    const describe = (c) => ({ id: c.song.id, path: c.file });
    groups.push({ title: keep.song.title, artist: keep.song.artist ?? "", keep: describe(keep), remove: remove.map(describe) });
  }
  return groups;
}

/** Moves a file into the trash (MUSIC_DIR/.spotifion-trash/<date>/<its path>), never over another one. */
function moveToTrash(file) {
  const day = new Date().toISOString().slice(0, 10);
  let dest = path.join(MUSIC_DIR, TRASH, day, file);
  for (let n = 2; fs.existsSync(dest); n++) {
    const ext = path.extname(file);
    dest = path.join(MUSIC_DIR, TRASH, day, `${file.slice(0, -ext.length || undefined)} (${n})${ext}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // Navidrome skips hidden folders; .ndignore makes sure of it.
  const ignore = path.join(MUSIC_DIR, TRASH, ".ndignore");
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "");
  fs.renameSync(path.join(MUSIC_DIR, file), dest);
}

// ---- HTTP -----------------------------------------------------------------------

export async function handleDuplicates(req, res, url, username, { navidromeUrl, readJson }) {
  try {
    const sub = url.pathname.replace(/^\/jam-api\/duplicates\/?/, "").replace(/\/$/, "");
    if (sub === "config" && req.method === "GET") return json(res, 200, { available: available() });
    if (sub !== "" || req.method !== "POST") throw new DuplicatesError(404, "Not found.");
    if (!available()) throw new DuplicatesError(503, "This server can't change the music files (no writable MUSIC_DIR).");

    const body = await readJson(req);
    const kind = body.kind === "album" ? "album" : body.kind === "playlist" ? "playlist" : null;
    const id = typeof body.id === "string" && body.id.length <= 100 ? body.id : null;
    if (!kind || !id) throw new DuplicatesError(400, "Invalid request.");

    if (busy) throw new DuplicatesError(409, "Another clean-up is running. Try again in a moment.");
    busy = true;
    try {
      // Worked out again when applying, never taken from the request.
      const groups = await plan(navidromeUrl, url.searchParams, kind, id);
      if (!body.apply) return json(res, 200, { groups });

      const failed = [];
      let moved = 0;
      for (const g of groups) {
        for (const r of g.remove) {
          try {
            moveToTrash(r.path);
            moved++;
          } catch (err) {
            console.error(`[duplicates] could not move ${r.path}:`, err.message);
            failed.push(r.path);
          }
        }
      }
      console.log(`[duplicates] ${username} cleaned ${kind} ${id}: ${moved} file(s) moved to ${TRASH}`);
      return json(res, 200, { groups, moved, failed });
    } finally {
      busy = false;
    }
  } catch (err) {
    if (!(err instanceof DuplicatesError)) throw err;
    json(res, err.status, { error: err.message });
  }
}
