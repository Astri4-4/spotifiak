// Profile pictures. Navidrome's API can't store one, so they're kept here:
// apps crop and shrink the picture to a small square JPEG and upload it, and
// show everyone's next to their name.
//
//   GET  /jam-api/avatars                  { avatars: { [username]: version } }
//   GET  /jam-api/avatars/:username        the picture (image/jpeg), 404 if none
//   POST /jam-api/avatars                  body: the JPEG - sets the caller's
//   POST /jam-api/avatars/remove           removes the caller's
//
// Saved in $JAM_DATA_DIR/avatars when it's set, else kept in memory until
// the server restarts.

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.JAM_DATA_DIR || "";
const AVATAR_DIR = DATA_DIR ? path.join(DATA_DIR, "avatars") : "";
/** Apps send 256x256 JPEGs, a few dozen KB; this leaves plenty of room. */
const MAX_BYTES = 300 * 1024;

/** By username: the picture and when it was set (its version, for caches). @type {Map<string, { data: Buffer, version: number }>} */
const avatars = loadAvatars();

class AvatarError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Usernames can hold any character; file names use their hex. */
const fileName = (username) => `${Buffer.from(username, "utf8").toString("hex")}.jpg`;

function loadAvatars() {
  const map = new Map();
  if (!AVATAR_DIR) return map;
  try {
    for (const name of fs.readdirSync(AVATAR_DIR)) {
      const match = name.match(/^([0-9a-f]+)\.jpg$/);
      if (!match) continue;
      const file = path.join(AVATAR_DIR, name);
      const username = Buffer.from(match[1], "hex").toString("utf8");
      map.set(username, { data: fs.readFileSync(file), version: Math.floor(fs.statSync(file).mtimeMs) });
    }
  } catch {
    // None saved yet.
  }
  return map;
}

function isJpeg(data) {
  return data.length > 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new AvatarError(413, "That picture is too big.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

/** Handles /jam-api/avatars/* for an authenticated Navidrome user. */
export async function handleAvatars(req, res, url, username) {
  try {
    await route(req, res, url, username);
  } catch (err) {
    if (!(err instanceof AvatarError)) throw err;
    json(res, err.status, { error: err.message });
  }
}

async function route(req, res, url, username) {
  const sub = decodeURIComponent(url.pathname.replace(/^\/jam-api\/avatars\/?/, "").replace(/\/$/, ""));

  if (!sub) {
    if (req.method === "GET") {
      return json(res, 200, {
        avatars: Object.fromEntries([...avatars].map(([user, a]) => [user, a.version])),
        persisted: Boolean(AVATAR_DIR),
      });
    }
    if (req.method !== "POST") throw new AvatarError(405, "Method not allowed.");
    const data = await readBody(req);
    if (!isJpeg(data)) throw new AvatarError(400, "The picture must be a JPEG.");
    const version = Date.now();
    avatars.set(username, { data, version });
    if (AVATAR_DIR) {
      try {
        fs.mkdirSync(AVATAR_DIR, { recursive: true });
        const file = path.join(AVATAR_DIR, fileName(username));
        fs.writeFileSync(file, data);
        // The file's time is its version after a restart: keep them equal, so caches stay valid.
        fs.utimesSync(file, version / 1000, version / 1000);
      } catch (err) {
        console.error("[avatars] could not save:", err.message);
      }
    }
    console.log(`[avatars] ${username} set their picture`);
    return json(res, 200, { version });
  }

  // (A GET is someone named "remove"'s picture.)
  if (sub === "remove" && req.method === "POST") {
    avatars.delete(username);
    if (AVATAR_DIR) fs.rmSync(path.join(AVATAR_DIR, fileName(username)), { force: true });
    return json(res, 204);
  }

  if (req.method !== "GET") throw new AvatarError(405, "Method not allowed.");
  const avatar = avatars.get(sub);
  if (!avatar) throw new AvatarError(404, "No picture.");
  res.writeHead(200, {
    "Content-Type": "image/jpeg",
    "Content-Length": avatar.data.length,
    // Apps ask with ?v=<version>, so a new picture is a new URL.
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  res.end(avatar.data);
}
