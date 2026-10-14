// Spotifion Jam server: shared listening sessions on top of Navidrome.
//
// Plain Node (no dependencies). Clients receive session state over
// Server-Sent Events and send actions with POST requests. The server never
// touches audio: it only keeps the shared queue and a playback clock
// ("track X, position P at server time T, playing/paused"), and every
// listener streams the audio straight from Navidrome on their own device.
//
// Every request carries the caller's Subsonic token-auth params (u/t/s),
// which are checked against Navidrome's `ping`, so only users of that
// Navidrome server can create or join Jams.
//
//   POST /jam-api/sessions                 create a Jam (caller is host)
//   GET  /jam-api/sessions/:id             session snapshot (join preview)
//   GET  /jam-api/sessions/:id/events      SSE stream of session state
//   POST /jam-api/sessions/:id/actions     { type, ... } - see ACTIONS
//   GET  /jam-api/healthz                  liveness/readiness (no auth)
//
// It also connects the devices of each account, like Spotify Connect: every
// open app is a device; the one playing publishes what it plays, and the
// others show it and can control it or move playback to themselves.
//
//   GET  /jam-api/me/events?deviceId&name&platform   SSE: devices + playback
//   POST /jam-api/me/state?deviceId        { state, claim? } from the playing device
//   POST /jam-api/me/commands?deviceId     { target, command } - see COMMANDS
//
// And it's the gateway to deemix for Discover (searching Deezer and
// downloading into the library) - see discover.mjs.
//
//   /jam-api/discover/...
//
// And it keeps each person's hidden duplicate songs - see hidden.mjs.
//
//   /jam-api/hidden/...
//
// And it keeps Mixes, playlists blended from several people's top songs -
// see mixes.mjs.
//
//   /jam-api/mixes/...
//
// And it keeps everyone's profile picture - see avatars.mjs.
//
//   /jam-api/avatars/...
//
// And it carries invitations to a Jam or a mix from one person to another -
// see invites.mjs.
//
//   /jam-api/invites/...

import http from "node:http";
import crypto from "node:crypto";
import { handleDiscover } from "./discover.mjs";
import { handleHidden } from "./hidden.mjs";
import { handleMixes, mixForInvite } from "./mixes.mjs";
import { handleAvatars } from "./avatars.mjs";
import { handleInvites, rememberPerson } from "./invites.mjs";

const PORT = Number(process.env.JAM_PORT || 3001);
const HOST = process.env.JAM_HOST || "127.0.0.1";
const NAVIDROME_URL = (process.env.NAVIDROME_URL || "https://navidrome.sachaguerin.fr").replace(/\/+$/, "");

const AUTH_TTL_MS = 10 * 60 * 1000;
const IDLE_SESSION_TTL_MS = 15 * 60 * 1000;
const HEARTBEAT_MS = 15 * 1000;
const MAX_QUEUE = 1000;
const MAX_TRACKS_PER_ACTION = 200;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_DEVICE_QUEUE = 500;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** @type {Map<string, Session>} */
const sessions = new Map();
/** @type {Map<string, { username: string, expires: number }>} */
const authCache = new Map();

/**
 * @typedef {{ uid: string, addedBy: string, track: Record<string, string | number>, fallback?: boolean }} QueueItem
 *   `fallback`: from a playlist or album that was played, rather than a song
 *   someone added: songs added play first, these when nothing else is queued.
 * @typedef {{ res: http.ServerResponse, username: string, clientId: string }} Listener
 * @typedef {{
 *   id: string,
 *   host: string,
 *   guestsCanControl: boolean,
 *   queue: QueueItem[],
 *   currentIndex: number,
 *   playing: boolean,
 *   position: number,
 *   positionAt: number,
 *   version: number,
 *   listeners: Set<Listener>,
 *   idleSince: number | null,
 * }} Session
 */

// ---- auth -------------------------------------------------------------

/** Resolves to the Navidrome username if u/t/s are valid credentials, else null. */
async function authenticate(params) {
  const u = params.get("u");
  const t = params.get("t");
  const s = params.get("s");
  if (!u || !t || !s) return null;

  const key = `${u}\n${t}\n${s}`;
  const cached = authCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.username;

  const query = new URLSearchParams({ u, t, s, v: "1.16.1", c: "spotifion-jam", f: "json" });
  try {
    const res = await fetch(`${NAVIDROME_URL}/rest/ping?${query}`, { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data?.["subsonic-response"]?.status !== "ok") return null;
  } catch (err) {
    console.error(`[jam] could not reach Navidrome at ${NAVIDROME_URL}:`, err.message);
    return null;
  }
  authCache.set(key, { username: u, expires: Date.now() + AUTH_TTL_MS });
  rememberPerson(u);
  return u;
}

// ---- session state ------------------------------------------------------

function newCode() {
  for (;;) {
    const bytes = crypto.randomBytes(6);
    const code = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    if (!sessions.has(code)) return code;
  }
}

/** Where the shared playhead is right now, in seconds. */
function currentPosition(session) {
  if (!session.playing) return session.position;
  return session.position + (Date.now() - session.positionAt) / 1000;
}

function setPosition(session, seconds) {
  session.position = Math.max(0, seconds);
  session.positionAt = Date.now();
}

function startTrackAt(session, index) {
  session.currentIndex = index;
  session.playing = index >= 0 && index < session.queue.length;
  setPosition(session, 0);
}

function hasCurrent(session) {
  return session.currentIndex >= 0 && session.currentIndex < session.queue.length;
}

/** Moves to the next track; running off the end stops playback. */
function advance(session) {
  startTrackAt(session, Math.min(session.currentIndex + 1, session.queue.length));
}

function members(session) {
  const byClient = new Map();
  for (const l of session.listeners) byClient.set(l.clientId, { username: l.username, clientId: l.clientId });
  return [...byClient.values()];
}

function publicState(session) {
  return {
    id: session.id,
    host: session.host,
    guestsCanControl: session.guestsCanControl,
    queue: session.queue,
    currentIndex: session.currentIndex,
    playing: session.playing,
    position: session.position,
    positionAt: session.positionAt,
    version: session.version,
    members: members(session),
  };
}

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(session) {
  session.version++;
  const payload = { state: publicState(session), now: Date.now() };
  for (const l of session.listeners) send(l.res, "state", payload);
}

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

/** Keeps only the track fields the UI needs, with the right types. */
function sanitizeTracks(tracks, max = MAX_TRACKS_PER_ACTION) {
  if (!Array.isArray(tracks)) return [];
  return tracks
    .slice(0, max)
    .filter((t) => t && typeof t.id === "string" && typeof t.title === "string")
    .map((t) => {
      const clean = {};
      for (const [key, type] of Object.entries(TRACK_FIELDS)) {
        if (typeof t[key] === type) clean[key] = type === "string" ? t[key].slice(0, 500) : t[key];
      }
      return clean;
    });
}

function toItems(tracks, addedBy, fallback = false) {
  return sanitizeTracks(tracks).map((track) => ({ uid: crypto.randomUUID(), addedBy, track, ...(fallback && { fallback: true }) }));
}

/** Where songs someone adds go: after the current one and the other added songs, before the playlist's. */
function priorityInsertAt(session) {
  const start = hasCurrent(session) ? session.currentIndex + 1 : session.queue.length;
  const firstFallback = session.queue.findIndex((item, i) => i >= start && item.fallback);
  return firstFallback === -1 ? session.queue.length : firstFallback;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireControl(session, username) {
  if (username !== session.host && !session.guestsCanControl) {
    throw new HttpError(403, "Only the host can control playback in this Jam.");
  }
}

function requireHost(session, username) {
  if (username !== session.host) throw new HttpError(403, "Only the host can do that.");
}

function insertItems(session, at, items) {
  if (session.queue.length + items.length > MAX_QUEUE) throw new HttpError(400, "The Jam queue is full.");
  session.queue.splice(at, 0, ...items);
}

/** Each handler mutates the session; the caller then broadcasts the new state. */
const ACTIONS = {
  // Anyone can add songs: they play before the playlist's (`fallback`: a
  // whole playlist or album, which goes after everything else instead).
  add(session, username, body) {
    const fallback = body.fallback === true;
    const items = toItems(body.tracks, username, fallback);
    if (items.length === 0) throw new HttpError(400, "No tracks to add.");
    const wasIdle = !hasCurrent(session);
    const at = fallback ? session.queue.length : priorityInsertAt(session);
    insertItems(session, at, items);
    if (wasIdle) startTrackAt(session, at);
  },

  // Play right now: the first track plays at once. Several tracks are a
  // playlist or album: the rest replaces the playlist that was playing, after
  // the songs people added, which keep their place.
  playNow(session, username, body) {
    requireControl(session, username);
    const [first, ...rest] = toItems(body.tracks, username);
    if (!first) throw new HttpError(400, "No tracks to play.");
    const at = hasCurrent(session) ? session.currentIndex + 1 : session.queue.length;
    if (rest.length === 0) {
      insertItems(session, at, [first]);
    } else {
      const upcoming = session.queue.slice(at);
      const added = upcoming.filter((item) => !item.fallback);
      const playlist = rest.map((item) => ({ ...item, fallback: true }));
      if (at + 1 + added.length + playlist.length > MAX_QUEUE) throw new HttpError(400, "The Jam queue is full.");
      session.queue.splice(at, upcoming.length, first, ...added, ...playlist);
    }
    startTrackAt(session, at);
  },

  jump(session, username, body) {
    requireControl(session, username);
    const index = session.queue.findIndex((i) => i.uid === body.uid);
    if (index === -1) throw new HttpError(404, "That song is no longer in the queue.");
    startTrackAt(session, index);
  },

  pause(session, username) {
    requireControl(session, username);
    if (!session.playing) return;
    setPosition(session, currentPosition(session));
    session.playing = false;
  },

  resume(session, username) {
    requireControl(session, username);
    if (!hasCurrent(session)) return;
    setPosition(session, session.position);
    session.playing = true;
  },

  seek(session, username, body) {
    requireControl(session, username);
    if (typeof body.position !== "number" || !Number.isFinite(body.position)) {
      throw new HttpError(400, "Invalid position.");
    }
    setPosition(session, body.position);
  },

  next(session, username) {
    requireControl(session, username);
    advance(session);
  },

  previous(session, username) {
    requireControl(session, username);
    if (hasCurrent(session) && currentPosition(session) > 3) setPosition(session, 0);
    else startTrackAt(session, Math.max(0, Math.min(session.currentIndex, session.queue.length) - 1));
  },

  // Sent by every listener when their copy of a track finishes; only the
  // first report for the current track counts.
  ended(session, _username, body) {
    const current = session.queue[session.currentIndex];
    if (!current || current.uid !== body.uid) return false;
    advance(session);
  },

  // Host and controllers can remove anything; guests only their own songs.
  remove(session, username, body) {
    const index = session.queue.findIndex((i) => i.uid === body.uid);
    if (index === -1) return false;
    const item = session.queue[index];
    if (item.addedBy !== username) requireControl(session, username);
    session.queue.splice(index, 1);
    if (index < session.currentIndex) session.currentIndex--;
    else if (index === session.currentIndex) startTrackAt(session, index);
  },

  // Reorder what's coming up: put `uid` right after `afterUid` (null: first).
  // Positions are by uid, so other changes meanwhile don't misplace it.
  move(session, username, body) {
    requireControl(session, username);
    const from = session.queue.findIndex((i) => i.uid === body.uid);
    if (from === -1) throw new HttpError(404, "That song is no longer in the queue.");
    if (from <= session.currentIndex) throw new HttpError(400, "Only songs coming up can be moved.");
    const [item] = session.queue.splice(from, 1);
    let to = 0;
    if (body.afterUid != null) {
      const after = session.queue.findIndex((i) => i.uid === body.afterUid);
      if (after === -1) {
        session.queue.splice(from, 0, item);
        throw new HttpError(404, "The queue changed meanwhile. Try again.");
      }
      to = after + 1;
    }
    // Never before or onto the current song; it stays current.
    const at = Math.max(to, session.currentIndex + 1);
    // It joins the group it lands in: dropped among the playlist's songs it's
    // one of them; among (or at the top, above) the added ones, it's added.
    const before = at > session.currentIndex + 1 ? session.queue[at - 1] : null;
    const after = session.queue[at];
    const fallback = before ? Boolean(before.fallback) && (after ? Boolean(after.fallback) : true) : false;
    if (fallback) item.fallback = true;
    else delete item.fallback;
    session.queue.splice(at, 0, item);
  },

  setGuestControl(session, username, body) {
    requireHost(session, username);
    session.guestsCanControl = Boolean(body.value);
  },
};

function endSession(session) {
  for (const l of session.listeners) {
    send(l.res, "ended", { reason: "The host ended the Jam." });
    l.res.end();
  }
  sessions.delete(session.id);
}

// ---- HTTP ---------------------------------------------------------------

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Request too large.");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    if (!body || typeof body !== "object") throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}

function openEvents(req, res, session, username, clientId) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // tell nginx not to buffer the stream
  });
  res.write("retry: 3000\n\n");

  const listener = { res, username, clientId };
  const isNewMember = !members(session).some((m) => m.clientId === clientId);
  session.listeners.add(listener);
  session.idleSince = null;
  if (isNewMember) broadcast(session);
  else send(res, "state", { state: publicState(session), now: Date.now() });

  req.on("close", () => {
    session.listeners.delete(listener);
    if (session.listeners.size === 0) session.idleSince = Date.now();
    if (sessions.has(session.id) && !members(session).some((m) => m.clientId === clientId)) broadcast(session);
  });
}

// ---- devices (Connect) ----------------------------------------------------

/**
 * @typedef {{ res: http.ServerResponse, id: string, name: string, platform: string }} Device
 * @typedef {{
 *   queue: Record<string, string | number>[], index: number, playing: boolean,
 *   position: number, duration: number, volume: number, shuffle: boolean,
 *   repeat: "off" | "all" | "one",
 * }} PlaybackState
 * @typedef {{
 *   devices: Map<string, Device>,
 *   active: { deviceId: string, state: PlaybackState, positionAt: number } | null,
 * }} Home
 */

/** Each account's connected devices, by Navidrome username. @type {Map<string, Home>} */
const homes = new Map();

function homeOf(username) {
  let home = homes.get(username);
  if (!home) {
    home = { devices: new Map(), active: null };
    homes.set(username, home);
  }
  return home;
}

function homeSnapshot(home) {
  return {
    devices: [...home.devices.values()].map(({ id, name, platform }) => ({ id, name, platform })),
    active: home.active,
    now: Date.now(),
  };
}

function broadcastHome(home) {
  const payload = homeSnapshot(home);
  for (const device of home.devices.values()) send(device.res, "devices", payload);
}

const REPEAT_MODES = ["off", "all", "one"];
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const queueOffset = (n) => clamp(Math.trunc(Number(n) || 0), -MAX_DEVICE_QUEUE, MAX_DEVICE_QUEUE);

/** @returns {PlaybackState} */
function sanitizeState(raw) {
  if (!raw || typeof raw !== "object") throw new HttpError(400, "Missing state.");
  const queue = sanitizeTracks(raw.queue, MAX_DEVICE_QUEUE);
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    queue,
    index: clamp(Math.trunc(num(raw.index)), -1, queue.length - 1),
    playing: raw.playing === true,
    position: Math.max(0, num(raw.position)),
    duration: Math.max(0, num(raw.duration)),
    volume: clamp(num(raw.volume), 0, 1),
    shuffle: raw.shuffle === true,
    repeat: REPEAT_MODES.includes(raw.repeat) ? raw.repeat : "off",
  };
}

/** Where the active device's playhead is right now, in seconds. */
function activePosition(active) {
  const { state } = active;
  if (!state.playing) return state.position;
  const elapsed = (Date.now() - active.positionAt) / 1000;
  return state.duration ? Math.min(state.duration, state.position + elapsed) : state.position + elapsed;
}

/** What a device may ask another one to do; each returns the command to forward (sanitized). */
const COMMANDS = {
  play: () => ({ type: "play" }),
  pause: () => ({ type: "pause" }),
  next: () => ({ type: "next" }),
  previous: () => ({ type: "previous" }),
  seek: (c) => ({ type: "seek", position: Math.max(0, Number(c.position) || 0) }),
  setVolume: (c) => ({ type: "setVolume", volume: clamp(Number(c.volume) || 0, 0, 1) }),
  setShuffle: (c) => ({ type: "setShuffle", value: c.value === true }),
  setRepeat: (c) => ({ type: "setRepeat", value: REPEAT_MODES.includes(c.value) ? c.value : "off" }),
  playQueue: (c) => {
    const tracks = sanitizeTracks(c.tracks, MAX_DEVICE_QUEUE);
    return { type: "playQueue", tracks, startIndex: clamp(Math.trunc(Number(c.startIndex) || 0), 0, Math.max(0, tracks.length - 1)) };
  },
  enqueue: (c) => ({ type: "enqueue", tracks: sanitizeTracks(c.tracks) }),
  addNext: (c) => ({ type: "addNext", tracks: sanitizeTracks(c.tracks) }),
  // Queue positions, relative to the current track.
  jump: (c) => ({ type: "jump", offset: queueOffset(c.offset) }),
  remove: (c) => ({ type: "remove", offset: queueOffset(c.offset) }),
  move: (c) => ({ type: "move", from: queueOffset(c.from), to: queueOffset(c.to) }),
  // Move playback to the target: it resumes the active device's queue where it is.
  transfer: (_c, home) =>
    home.active && { type: "transfer", state: { ...home.active.state, position: activePosition(home.active) } },
};

function openDeviceEvents(res, username, home, device) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");
  // A reconnecting device replaces its old stream.
  home.devices.get(device.id)?.res.end();
  home.devices.set(device.id, device);
  broadcastHome(home);

  res.on("close", () => {
    if (home.devices.get(device.id) !== device) return;
    home.devices.delete(device.id);
    if (home.active?.deviceId === device.id) home.active = null;
    if (home.devices.size === 0) {
      homes.delete(username);
    } else {
      broadcastHome(home);
    }
  });
}

async function handleDevices(req, res, url, username, sub) {
  const deviceId = url.searchParams.get("deviceId");
  if (!deviceId || deviceId.length > 100) return json(res, 400, { error: "Missing deviceId." });
  const home = homeOf(username);

  if (sub === "events") {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
    const name = (url.searchParams.get("name") || "Unknown device").slice(0, 60);
    const platform = (url.searchParams.get("platform") || "web").slice(0, 20);
    return openDeviceEvents(res, username, home, { res, id: deviceId, name, platform });
  }

  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  if (!home.devices.has(deviceId)) return json(res, 409, { error: "This device isn't connected." });
  const body = await readJson(req);

  if (sub === "state") {
    const state = sanitizeState(body.state);
    // A device becomes the active one by playing (or by taking over paused
    // playback with `claim`); a paused one only updates itself.
    if (state.playing || body.claim === true || home.active?.deviceId === deviceId) {
      home.active = { deviceId, state, positionAt: Date.now() };
      broadcastHome(home);
    }
    return json(res, 204);
  }

  // sub === "commands"
  const target = home.devices.get(String(body.target));
  if (!target) return json(res, 404, { error: "That device is no longer available." });
  const make = body.command && Object.hasOwn(COMMANDS, body.command.type) ? COMMANDS[body.command.type] : null;
  if (!make) return json(res, 400, { error: "Unknown command." });
  const command = make(body.command, home);
  if (!command) return json(res, 409, { error: "Nothing is playing." });
  send(target.res, "command", { from: deviceId, command });
  return json(res, 204);
}

/** What an invite to a Jam or a mix is for, or null once it's over (see invites.mjs). */
function inviteTarget(kind, code) {
  if (kind === "mix") return mixForInvite(code);
  const session = sessions.get(code);
  if (!session) return null;
  return { name: session.host, members: [session.host, ...members(session).map((m) => m.username)] };
}

async function handle(req, res) {
  const url = new URL(req.url, "http://jam.local");
  // The mobile app calls this server cross-origin. Any origin is fine: every
  // request carries its own Navidrome credentials, and no cookies are used.
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }
  // Unauthenticated health check for container/Kubernetes probes.
  if (url.pathname === "/jam-api/healthz") return json(res, 200, { ok: true, sessions: sessions.size });

  if (url.pathname === "/jam-api/hidden" || url.pathname.startsWith("/jam-api/hidden/")) {
    const username = await authenticate(url.searchParams);
    if (!username) return json(res, 401, { error: "Invalid Navidrome credentials." });
    return handleHidden(req, res, url, username, { readJson });
  }

  if (url.pathname === "/jam-api/avatars" || url.pathname.startsWith("/jam-api/avatars/")) {
    const username = await authenticate(url.searchParams);
    if (!username) return json(res, 401, { error: "Invalid Navidrome credentials." });
    return handleAvatars(req, res, url, username);
  }

  if (url.pathname === "/jam-api/mixes" || url.pathname.startsWith("/jam-api/mixes/")) {
    const username = await authenticate(url.searchParams);
    if (!username) return json(res, 401, { error: "Invalid Navidrome credentials." });
    return handleMixes(req, res, url, username, { readJson });
  }

  if (url.pathname === "/jam-api/invites" || url.pathname.startsWith("/jam-api/invites/")) {
    const username = await authenticate(url.searchParams);
    if (!username) return json(res, 401, { error: "Invalid Navidrome credentials." });
    return handleInvites(req, res, url, username, { readJson, lookup: inviteTarget });
  }

  if (url.pathname.startsWith("/jam-api/discover/")) {
    const username = await authenticate(url.searchParams);
    if (!username) return json(res, 401, { error: "Invalid Navidrome credentials." });
    return handleDiscover(req, res, url, username, { navidromeUrl: NAVIDROME_URL, readJson });
  }

  const deviceRoute = url.pathname.match(/^\/jam-api\/me\/(events|state|commands)\/?$/);
  if (deviceRoute) {
    const username = await authenticate(url.searchParams);
    if (!username) return json(res, 401, { error: "Invalid Navidrome credentials." });
    return handleDevices(req, res, url, username, deviceRoute[1]);
  }
  const match = url.pathname.match(/^\/jam-api\/sessions(?:\/([A-Z0-9]{6})(\/events|\/actions)?)?\/?$/);
  if (!match) return json(res, 404, { error: "Not found." });
  const [, id, sub] = match;

  const username = await authenticate(url.searchParams);
  if (!username) return json(res, 401, { error: "Invalid Navidrome credentials." });

  if (!id) {
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
    const session = {
      id: newCode(),
      host: username,
      guestsCanControl: false,
      queue: [],
      currentIndex: -1,
      playing: false,
      position: 0,
      positionAt: Date.now(),
      version: 0,
      listeners: new Set(),
      idleSince: Date.now(),
    };
    sessions.set(session.id, session);
    console.log(`[jam] ${username} started Jam ${session.id}`);
    return json(res, 201, { id: session.id });
  }

  const session = sessions.get(id);
  if (!session) return json(res, 404, { error: "This Jam has ended or doesn't exist." });

  if (!sub) {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
    return json(res, 200, { state: publicState(session), now: Date.now() });
  }

  if (sub === "/events") {
    if (req.method !== "GET") return json(res, 405, { error: "Method not allowed." });
    const clientId = url.searchParams.get("clientId");
    if (!clientId || clientId.length > 100) return json(res, 400, { error: "Missing clientId." });
    return openEvents(req, res, session, username, clientId);
  }

  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  const body = await readJson(req);

  if (body.type === "end") {
    requireHost(session, username);
    console.log(`[jam] ${username} ended Jam ${session.id}`);
    endSession(session);
    return json(res, 204);
  }

  const action = Object.hasOwn(ACTIONS, body.type) ? ACTIONS[body.type] : null;
  if (!action) return json(res, 400, { error: "Unknown action." });
  if (action(session, username, body) !== false) broadcast(session);
  return json(res, 204);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (res.headersSent) return res.end();
    if (err instanceof HttpError) return json(res, err.status, { error: err.message });
    console.error("[jam] unexpected error:", err);
    json(res, 500, { error: "Internal error." });
  });
});

// Keep SSE connections alive through proxies, refresh client clock offsets,
// and drop sessions nobody has been connected to for a while.
setInterval(() => {
  const now = Date.now();
  for (const home of homes.values()) {
    for (const device of home.devices.values()) send(device.res, "ping", { now });
  }
  for (const session of sessions.values()) {
    for (const l of session.listeners) send(l.res, "ping", { now });
    if (session.idleSince !== null && now - session.idleSince > IDLE_SESSION_TTL_MS) {
      console.log(`[jam] Jam ${session.id} expired (no listeners)`);
      sessions.delete(session.id);
    }
  }
  for (const [key, entry] of authCache) if (entry.expires <= now) authCache.delete(key);
}, HEARTBEAT_MS);

server.listen(PORT, HOST, () => {
  console.log(`[jam] listening on http://${HOST}:${PORT} (Navidrome: ${NAVIDROME_URL})`);
});
