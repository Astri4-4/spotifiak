// Discover: search Deezer and download music into the Navidrome library,
// through a deemix instance (https://github.com/bambanah/deemix) whose
// download folder is Navidrome's music folder.
//
// The Jam server is the gateway: clients never talk to deemix. Deemix's own
// API hands its Deezer login (ARL) to anyone who asks and has no users of its
// own, so it should stay out of reach; here only Navidrome users get through,
// and only to search, start downloads and follow their progress. The ARL,
// deemix's address (except to admins) and its file paths never leave the
// server.
//
//   GET  /jam-api/discover/config           { available, url?, canEdit }
//   POST /jam-api/discover/config           { url } - Navidrome admins only
//   GET  /jam-api/discover/search?q&type    type: "track" | "album"
//   POST /jam-api/discover/downloads        { type, id } - start a download
//   GET  /jam-api/discover/downloads        this user's downloads and their progress
//
// The deemix address comes from Settings (saved in $JAM_DATA_DIR, when set)
// or the DEEMIX_URL environment variable. The ARL is the one deemix itself
// keeps (single-user mode), or DEEMIX_ARL.

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.JAM_DATA_DIR || "";
const CONFIG_FILE = DATA_DIR ? path.join(DATA_DIR, "discover.json") : "";
const DEEMIX_TIMEOUT_MS = 15_000;
const ADMIN_TTL_MS = 10 * 60 * 1000;
const MAX_TRACKED_DOWNLOADS = 500;
const SEARCH_LIMIT = 30;

let deemixUrl = loadDeemixUrl();
/** deemix's session cookie, which it ties its Deezer login to. */
let cookie = "";
let loggedIn = false;
/** Downloads started through Spotifion: deemix queue uuid -> who asked for it. */
const downloads = new Map();
/** @type {Map<string, { admin: boolean, expires: number }>} */
const adminCache = new Map();

function loadDeemixUrl() {
  try {
    if (CONFIG_FILE) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      if (typeof saved.deemixUrl === "string") return saved.deemixUrl;
    }
  } catch {
    // No saved setting yet.
  }
  return (process.env.DEEMIX_URL || "").replace(/\/+$/, "");
}

/** Trims and checks an http(s) base URL; "" turns Discover off. */
function normaliseUrl(value) {
  const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new DiscoverError(400, "That isn't a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DiscoverError(400, "The URL must start with http:// or https://.");
  }
  return trimmed;
}

class DiscoverError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---- deemix -----------------------------------------------------------

async function deemix(pathAndQuery, { method = "GET", body } = {}) {
  if (!deemixUrl) throw new DiscoverError(503, "Discover isn't set up on this server.");
  let res;
  try {
    res = await fetch(`${deemixUrl}/api/${pathAndQuery}`, {
      method,
      headers: {
        ...(cookie && { Cookie: cookie }),
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(DEEMIX_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`[discover] could not reach deemix at ${deemixUrl}:`, err.message);
    throw new DiscoverError(502, "Couldn't reach the download server.");
  }
  const setCookie = res.headers.get("set-cookie")?.match(/connect\.sid=[^;]+/);
  if (setCookie && setCookie[0] !== cookie) {
    // A new deemix session isn't logged in to Deezer yet.
    cookie = setCookie[0];
    loggedIn = false;
  }
  if (!res.ok) throw new DiscoverError(502, `The download server answered HTTP ${res.status}.`);
  return res.json();
}

/** Logs deemix's session in to Deezer, with the ARL deemix keeps (or DEEMIX_ARL). */
async function ensureLoggedIn() {
  if (loggedIn && cookie) return;
  const connect = await deemix("connect");
  if (connect?.currentUser?.id) {
    loggedIn = true;
    return;
  }
  const arl = process.env.DEEMIX_ARL || connect?.singleUser?.arl;
  if (!arl) throw new DiscoverError(503, "The download server isn't logged in to Deezer.");
  const login = await deemix("loginArl", { method: "POST", body: { arl } });
  // 1: logged in, 2: already logged in, 3: forced.
  if (![1, 2, 3].includes(login?.status)) {
    throw new DiscoverError(503, "The download server couldn't log in to Deezer. Its ARL may have expired.");
  }
  loggedIn = true;
}

// ---- what clients get -----------------------------------------------------

const str = (v) => (typeof v === "string" ? v.slice(0, 500) : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function cleanTrack(t) {
  return {
    id: String(t.id),
    title: str(t.title),
    artist: str(t.artist?.name),
    album: str(t.album?.title),
    duration: num(t.duration),
    cover: str(t.album?.cover_medium),
    // Deezer's public 30-second preview.
    preview: str(t.preview),
  };
}

function cleanAlbum(a) {
  return {
    id: String(a.id),
    title: str(a.title),
    artist: str(a.artist?.name),
    cover: str(a.cover_medium),
    trackCount: num(a.nb_tracks),
  };
}

function cleanDownload(item) {
  return {
    uuid: str(item.uuid),
    type: str(item.type),
    title: str(item.title),
    artist: str(item.artist),
    cover: str(item.cover),
    status: str(item.status) || "inQueue",
    progress: Math.min(100, num(item.progress)),
    size: num(item.size),
    downloaded: num(item.downloaded),
    failed: num(item.failed),
  };
}

// ---- admins ---------------------------------------------------------------

/** Whether the caller is a Navidrome admin (who may point Discover at another deemix). */
async function isAdmin(navidromeUrl, params) {
  const u = params.get("u");
  const key = `${u}\n${params.get("t")}\n${params.get("s")}`;
  const cached = adminCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.admin;
  const query = new URLSearchParams({
    u,
    t: params.get("t"),
    s: params.get("s"),
    v: "1.16.1",
    c: "spotifion-jam",
    f: "json",
    username: u,
  });
  let admin = false;
  try {
    const res = await fetch(`${navidromeUrl}/rest/getUser?${query}`, { signal: AbortSignal.timeout(8000) });
    admin = (await res.json())?.["subsonic-response"]?.user?.adminRole === true;
  } catch {
    // Treated as not an admin.
  }
  adminCache.set(key, { admin, expires: Date.now() + ADMIN_TTL_MS });
  return admin;
}

// ---- HTTP -----------------------------------------------------------------

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/**
 * Handles /jam-api/discover/* for an authenticated Navidrome user.
 * @param {(req: import("node:http").IncomingMessage) => Promise<any>} readJson
 */
export async function handleDiscover(req, res, url, username, { navidromeUrl, readJson }) {
  try {
    await route(req, res, url, username, navidromeUrl, readJson);
  } catch (err) {
    if (!(err instanceof DiscoverError)) throw err;
    json(res, err.status, { error: err.message });
  }
}

async function route(req, res, url, username, navidromeUrl, readJson) {
  const sub = url.pathname.replace(/^\/jam-api\/discover\/?/, "").replace(/\/$/, "");

  if (sub === "config") {
    const canEdit = await isAdmin(navidromeUrl, url.searchParams);
    if (req.method === "GET") {
      return json(res, 200, { available: Boolean(deemixUrl), canEdit, ...(canEdit && { url: deemixUrl }) });
    }
    if (req.method !== "POST") throw new DiscoverError(405, "Method not allowed.");
    if (!canEdit) throw new DiscoverError(403, "Only Navidrome admins can change this.");
    const next = normaliseUrl((await readJson(req)).url);
    let saved = true;
    if (CONFIG_FILE) {
      try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(CONFIG_FILE, JSON.stringify({ deemixUrl: next }));
      } catch (err) {
        console.error("[discover] could not save the setting:", err.message);
        saved = false;
      }
    } else {
      saved = false;
    }
    if (next !== deemixUrl) {
      deemixUrl = next;
      cookie = "";
      loggedIn = false;
    }
    console.log(`[discover] ${username} set the deemix server to ${next || "(none)"}`);
    // `persisted: false`: it lasts until the server restarts (no writable JAM_DATA_DIR).
    return json(res, 200, { available: Boolean(deemixUrl), canEdit, url: deemixUrl, persisted: saved });
  }

  if (sub === "search") {
    if (req.method !== "GET") throw new DiscoverError(405, "Method not allowed.");
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
    const type = url.searchParams.get("type") === "album" ? "album" : "track";
    if (!q) return json(res, 200, { results: [] });
    const query = new URLSearchParams({ term: q, type, start: "0", nb: String(SEARCH_LIMIT) });
    const found = await deemix(`search?${query}`);
    const data = Array.isArray(found?.data) ? found.data : [];
    return json(res, 200, { results: data.map(type === "album" ? cleanAlbum : cleanTrack) });
  }

  if (sub === "downloads") {
    if (req.method === "GET") {
      const queue = (await deemix("getQueue"))?.queue ?? {};
      const mine = [...downloads].filter(([, d]) => d.username === username);
      return json(res, 200, {
        downloads: mine.map(([uuid, d]) => (queue[uuid] ? cleanDownload(queue[uuid]) : { ...d.item, status: "gone" })),
      });
    }
    if (req.method !== "POST") throw new DiscoverError(405, "Method not allowed.");
    const body = await readJson(req);
    const type = body.type === "album" ? "album" : body.type === "track" ? "track" : null;
    const id = typeof body.id === "string" && /^\d{1,20}$/.test(body.id) ? body.id : null;
    if (!type || !id) throw new DiscoverError(400, "Invalid download.");

    await ensureLoggedIn();
    // bitrate null: deemix's own setting.
    const add = () => deemix("addToQueue", { method: "POST", body: { url: `https://www.deezer.com/${type}/${id}`, bitrate: null } });
    let added = await add();
    if (added?.errid === "NotLoggedIn") {
      loggedIn = false;
      await ensureLoggedIn();
      added = await add();
    }
    if (!added?.result) {
      if (added?.errid === "AlreadyInQueue") throw new DiscoverError(409, "That's already being downloaded.");
      throw new DiscoverError(502, "The download server couldn't add that download.");
    }
    const items = (Array.isArray(added.data?.obj) ? added.data.obj : [added.data?.obj]).filter(Boolean).map(cleanDownload);
    for (const item of items) downloads.set(item.uuid, { username, item });
    // Forget the oldest once there are many.
    while (downloads.size > MAX_TRACKED_DOWNLOADS) downloads.delete(downloads.keys().next().value);
    console.log(`[discover] ${username} is downloading ${type} ${id}`);
    return json(res, 201, { downloads: items });
  }

  throw new DiscoverError(404, "Not found.");
}
