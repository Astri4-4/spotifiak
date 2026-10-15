// Event calendar: upcoming releases and concerts of the artists each person
// follows.
//
// Releases come from MusicBrainz (free, no key; announced albums often show
// up there before they're out), concerts from Ticketmaster's Discovery API
// (free with a key, set by a Navidrome admin in Settings or with
// TICKETMASTER_API_KEY). The server looks each artist up at most once a day
// for releases and twice a day for concerts, in the background, and shares
// what it finds between everyone following them; MusicBrainz asks for no
// more than one request a second.
//
//   GET  /jam-api/events                    { artists, events, country, ... }
//   POST /jam-api/events/follow             { id, name, mbid? } - a Navidrome artist
//   POST /jam-api/events/unfollow           { id }
//   POST /jam-api/events/settings           { country } - "" for everywhere
//   POST /jam-api/events/seen               the calendar was looked at (for "new")
//   POST /jam-api/events/ics-token          { reset? } -> { token }
//   GET  /jam-api/events/config             { concertsAvailable, canEdit, hasKey? }
//   POST /jam-api/events/config             { ticketmasterKey } - Navidrome admins only
//   GET  /jam-api/events/ics/:token.ics     the calendar for calendar apps (no login: the token is the key)
//
// Kept in $JAM_DATA_DIR/events.json when set, else until the server restarts.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { isAdmin } from "./discover.mjs";

const DATA_DIR = process.env.JAM_DATA_DIR || "";
const DATA_FILE = DATA_DIR ? path.join(DATA_DIR, "events.json") : "";
const USER_AGENT = "Spotifiak/1.0 ( https://github.com/Astri4-4/spotifiak )";
const FETCH_TIMEOUT_MS = 15_000;

const RELEASES_TTL_MS = 24 * 60 * 60 * 1000;
const CONCERTS_TTL_MS = 12 * 60 * 60 * 1000;
/** After a failure, try again sooner than the TTL. */
const RETRY_MS = 60 * 60 * 1000;
const REFRESH_EVERY_MS = 60 * 60 * 1000;
/** MusicBrainz allows one request a second; Ticketmaster five. */
const MUSICBRAINZ_GAP_MS = 1100;
const TICKETMASTER_GAP_MS = 250;
/** Releases from this long ago still show, as "recently out". */
const RECENT_DAYS = 60;
const MAX_ARTISTS = 200;
/** Events found this soon after following an artist were already there: not "new". */
const SETTLE_MS = 30 * 60 * 1000;
/** Release kinds that aren't new music. */
const SKIPPED_SECONDARY_TYPES = new Set(["Compilation", "Remix", "DJ-mix", "Mixtape/Street", "Interview", "Audiobook", "Audio drama", "Spokenword", "Demo"]);

/**
 * @typedef {{ id: string, name: string, mbid: string, followedAt: number }} FollowedArtist
 * @typedef {{ artists: FollowedArtist[], country: string, lastVisit: number, icsToken: string }} UserEvents
 * @typedef {{
 *   id: string, kind: "release" | "concert", date: string, time?: string, title: string,
 *   type?: string, venue?: string, city?: string, country?: string, countryCode?: string,
 *   status?: string, url: string, image?: string, seenAt: number,
 * }} CalendarEvent
 * @typedef {{
 *   name: string, mbid: string | null,
 *   releases?: { at: number, items: CalendarEvent[], error?: boolean },
 *   concerts?: { at: number, items: CalendarEvent[], attractionId: string | null, error?: boolean },
 * }} ArtistCache
 */

/** @type {{ users: Record<string, UserEvents>, artists: Record<string, ArtistCache>, ticketmasterKey: string }} */
const state = load();
let saveTimer = null;
let saving = Boolean(DATA_FILE);

class EventsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function load() {
  const empty = { users: {}, artists: {}, ticketmasterKey: "" };
  try {
    if (DATA_FILE) return { ...empty, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
  } catch {
    // Nothing saved yet.
  }
  return empty;
}

function save() {
  if (!DATA_FILE || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(state));
      fs.renameSync(tmp, DATA_FILE);
      saving = true;
    } catch (err) {
      console.error("[events] could not save:", err.message);
      saving = false;
    }
  }, 2000);
  saveTimer.unref?.();
}

const ticketmasterKey = () => state.ticketmasterKey || process.env.TICKETMASTER_API_KEY || "";

function userOf(username) {
  state.users[username] ??= { artists: [], country: "", lastVisit: 0, icsToken: "" };
  return state.users[username];
}

/** One cache entry per artist, shared by everyone following them. */
const cacheKey = (artist) => (artist.mbid ? `mb:${artist.mbid}` : `name:${fold(artist.name)}`);

/** Lowercase, without accents, for comparing names. */
const fold = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const today = () => new Date().toISOString().slice(0, 10);

// ---- fetching ----------------------------------------------------------------

/** Calls to one service go one after another, `gap` ms apart. */
function throttle(gap) {
  let last = Promise.resolve();
  return (task) => {
    const run = last.then(task);
    last = run.catch(() => void 0).then(() => new Promise((r) => setTimeout(r, gap)));
    return run;
  };
}
const musicbrainz = throttle(MUSICBRAINZ_GAP_MS);
const ticketmaster = throttle(TICKETMASTER_GAP_MS);

async function getJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`${new URL(url).hostname} answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** The MusicBrainz id of an artist known only by name, when one matches exactly. */
async function findMbid(name) {
  const query = new URLSearchParams({ query: `artist:"${name.replace(/"/g, "")}"`, limit: "10", fmt: "json" });
  const body = await musicbrainz(() => getJson(`https://musicbrainz.org/ws/2/artist?${query}`));
  const match = (body.artists ?? []).find(
    (a) => a.score >= 90 && (fold(a.name) === fold(name) || (a.aliases ?? []).some((al) => fold(al.name) === fold(name))),
  );
  return match?.id ?? null;
}

async function fetchReleases(mbid) {
  const from = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const query = new URLSearchParams({
    query: `arid:${mbid} AND firstreleasedate:[${from} TO 2999-12-31]`,
    limit: "100",
    fmt: "json",
  });
  const body = await musicbrainz(() => getJson(`https://musicbrainz.org/ws/2/release-group?${query}`));
  return (body["release-groups"] ?? [])
    .filter((rg) => rg["first-release-date"] && !(rg["secondary-types"] ?? []).some((t) => SKIPPED_SECONDARY_TYPES.has(t)))
    .map((rg) => ({
      id: `rel:${rg.id}`,
      kind: "release",
      date: rg["first-release-date"],
      title: rg.title,
      type: [rg["primary-type"], ...(rg["secondary-types"] ?? [])].filter(Boolean).join(" · ") || "Release",
      url: `https://musicbrainz.org/release-group/${rg.id}`,
      image: `https://coverartarchive.org/release-group/${rg.id}/front-250`,
    }));
}

/** Ticketmaster's id for an artist: the one linked to its MusicBrainz id, or else the same name. */
async function findAttraction(name, mbid, key) {
  const query = new URLSearchParams({ apikey: key, keyword: name, classificationName: "music", size: "20" });
  const body = await ticketmaster(() => getJson(`https://app.ticketmaster.com/discovery/v2/attractions.json?${query}`));
  const found = body._embedded?.attractions ?? [];
  const byMbid = mbid && found.find((a) => (a.externalLinks?.musicbrainz ?? []).some((l) => l.id === mbid));
  return (byMbid || found.find((a) => fold(a.name) === fold(name)))?.id ?? null;
}

function pickImage(images = []) {
  const wide = images.filter((i) => i.ratio === "16_9" || i.ratio === "3_2").sort((a, b) => Math.abs(a.width - 640) - Math.abs(b.width - 640));
  return (wide[0] ?? images[0])?.url;
}

async function fetchConcerts(attractionId, key) {
  const query = new URLSearchParams({ apikey: key, attractionId, size: "100", sort: "date,asc" });
  const body = await ticketmaster(() => getJson(`https://app.ticketmaster.com/discovery/v2/events.json?${query}`));
  return (body._embedded?.events ?? [])
    .filter((e) => e.dates?.start?.localDate)
    .map((e) => {
      const venue = e._embedded?.venues?.[0];
      const status = e.dates?.status?.code;
      return {
        id: `tm:${e.id}`,
        kind: "concert",
        date: e.dates.start.localDate,
        ...(e.dates.start.localTime && !e.dates.start.timeTBA && { time: e.dates.start.localTime.slice(0, 5) }),
        title: e.name,
        venue: venue?.name,
        city: venue?.city?.name,
        country: venue?.country?.name,
        countryCode: venue?.country?.countryCode,
        ...(status && status !== "onsale" && status !== "offsale" && { status }),
        url: e.url,
        image: pickImage(e.images),
      };
    });
}

/** Keeps when each event was first found, so new ones can be told apart. */
function stamp(items, previous = []) {
  const seen = new Map(previous.map((e) => [e.id, e.seenAt]));
  const now = Date.now();
  return items.map((e) => ({ ...e, seenAt: seen.get(e.id) ?? now }));
}

const isStale = (part, ttl) => !part || Date.now() - part.at > (part.error ? RETRY_MS : ttl);

/** Brings one artist's releases and concerts up to date (each only if it's due). */
async function refreshArtist(key, artist) {
  const entry = (state.artists[key] ??= { name: artist.name, mbid: artist.mbid || null });

  if (isStale(entry.releases, RELEASES_TTL_MS)) {
    try {
      if (!entry.mbid) entry.mbid = await findMbid(entry.name);
      const items = entry.mbid ? await fetchReleases(entry.mbid) : [];
      entry.releases = { at: Date.now(), items: stamp(items, entry.releases?.items) };
    } catch (err) {
      console.error(`[events] releases of ${entry.name}:`, err.message);
      entry.releases = { at: Date.now(), items: entry.releases?.items ?? [], error: true };
    }
    save();
  }

  const tmKey = ticketmasterKey();
  if (tmKey && isStale(entry.concerts, CONCERTS_TTL_MS)) {
    try {
      const attractionId = entry.concerts?.attractionId ?? (await findAttraction(entry.name, entry.mbid, tmKey));
      const items = attractionId ? await fetchConcerts(attractionId, tmKey) : [];
      entry.concerts = { at: Date.now(), items: stamp(items, entry.concerts?.items), attractionId };
    } catch (err) {
      console.error(`[events] concerts of ${entry.name}:`, err.message);
      // A key Ticketmaster refuses: try again only once it changes.
      entry.concerts = { at: Date.now(), items: entry.concerts?.items ?? [], attractionId: entry.concerts?.attractionId ?? null, error: err.status !== 401 };
    }
    save();
  }
}

// One artist at a time, in the background.
const queue = new Map();
let working = false;

function enqueue(artist) {
  const key = cacheKey(artist);
  const entry = state.artists[key];
  const due = isStale(entry?.releases, RELEASES_TTL_MS) || (ticketmasterKey() && isStale(entry?.concerts, CONCERTS_TTL_MS));
  if (due && !queue.has(key)) queue.set(key, artist);
  if (!working) void work();
}

async function work() {
  working = true;
  while (queue.size) {
    const [key, artist] = queue.entries().next().value;
    await refreshArtist(key, artist).catch((err) => console.error("[events]", err.message));
    queue.delete(key);
  }
  working = false;
}

function refreshAll() {
  for (const user of Object.values(state.users)) user.artists.forEach(enqueue);
  // Forget artists nobody follows any more.
  const followed = new Set(Object.values(state.users).flatMap((u) => u.artists.map(cacheKey)));
  for (const key of Object.keys(state.artists)) if (!followed.has(key)) delete state.artists[key];
}
setTimeout(refreshAll, 10_000).unref?.();
setInterval(refreshAll, REFRESH_EVERY_MS).unref?.();

// ---- what a person sees --------------------------------------------------------

function eventsFor(user) {
  const cutoff = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const now = today();
  const events = [];
  for (const artist of user.artists) {
    const entry = state.artists[cacheKey(artist)];
    if (!entry) continue;
    const isNew = (e) => e.seenAt > user.lastVisit && e.seenAt - artist.followedAt > SETTLE_MS;
    for (const e of entry.releases?.items ?? []) {
      if (e.date >= cutoff) events.push({ ...e, artistId: artist.id, artistName: artist.name, isNew: isNew(e) });
    }
    if (!ticketmasterKey()) continue;
    for (const e of entry.concerts?.items ?? []) {
      if (e.date < now || (user.country && e.countryCode !== user.country)) continue;
      events.push({ ...e, artistId: artist.id, artistName: artist.name, isNew: isNew(e) });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""));
}

function summary(username) {
  const user = userOf(username);
  user.artists.forEach(enqueue);
  const keys = new Set(user.artists.map(cacheKey));
  return {
    artists: user.artists.map((a) => {
      const entry = state.artists[cacheKey(a)];
      // null: not looked up yet; false: MusicBrainz doesn't know them.
      const matched = entry?.releases ? Boolean(entry.mbid) : null;
      return { id: a.id, name: a.name, matched };
    }),
    events: eventsFor(user),
    country: user.country,
    concertsAvailable: Boolean(ticketmasterKey()),
    pending: [...queue.keys()].filter((k) => keys.has(k)).length,
    persisted: saving,
  };
}

// ---- calendar apps ----------------------------------------------------------------

function icsText(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 bytes continue on the next, after a space. */
function fold75(line) {
  const out = [];
  let rest = Buffer.from(line);
  while (rest.length > 75) {
    let cut = out.length ? 74 : 75;
    while (cut > 0 && (rest[cut] & 0xc0) === 0x80) cut--; // don't split a character
    out.push(rest.subarray(0, cut).toString());
    rest = rest.subarray(cut);
  }
  out.push(rest.toString());
  return out.join("\r\n ");
}

function toIcs(events) {
  const stampNow = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Spotifiak//Events//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Spotifiak"];
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue; // only a month or a year: no day to put it on
    const day = e.date.replace(/-/g, "");
    const summary = e.kind === "release" ? `${e.artistName} - ${e.title} (${e.type})` : `${e.artistName} - ${[e.venue, e.city].filter(Boolean).join(", ") || e.title}`;
    lines.push("BEGIN:VEVENT", `UID:${e.id}@spotifiak`, `DTSTAMP:${stampNow}`);
    if (e.time) {
      // The venue's local time, as is ("floating").
      lines.push(`DTSTART:${day}T${e.time.replace(":", "")}00`, "DURATION:PT3H");
    } else {
      const next = new Date(`${e.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${icsText(summary)}`, `URL:${icsText(e.url)}`);
    if (e.kind === "concert") lines.push(`LOCATION:${icsText([e.venue, e.city, e.country].filter(Boolean).join(", "))}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold75).join("\r\n") + "\r\n";
}

/** GET /jam-api/events/ics/:token.ics - no Navidrome login: calendar apps can't give one. */
export function handleEventsIcs(req, res, url) {
  const token = url.pathname.match(/^\/jam-api\/events\/ics\/([A-Za-z0-9_-]{20,})\.ics$/)?.[1];
  const entry = token && Object.entries(state.users).find(([, u]) => u.icsToken === token);
  if (!entry) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found.");
  }
  const user = entry[1];
  user.artists.forEach(enqueue);
  res.writeHead(200, { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" });
  res.end(toIcs(eventsFor(user)));
}

// ---- routes ------------------------------------------------------------------------

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

/**
 * Handles /jam-api/events/* for an authenticated Navidrome user.
 * @param {{ navidromeUrl: string, readJson: (req: import("node:http").IncomingMessage) => Promise<any> }} deps
 */
export async function handleEvents(req, res, url, username, { navidromeUrl, readJson }) {
  try {
    await route(req, res, url, username, navidromeUrl, readJson);
  } catch (err) {
    if (!(err instanceof EventsError)) throw err;
    json(res, err.status, { error: err.message });
  }
}

const isId = (v) => typeof v === "string" && v.length > 0 && v.length <= 100;

async function route(req, res, url, username, navidromeUrl, readJson) {
  const sub = url.pathname.replace(/^\/jam-api\/events\/?/, "").replace(/\/$/, "");

  if (sub === "config") {
    const canEdit = await isAdmin(navidromeUrl, url.searchParams);
    if (req.method === "GET") {
      return json(res, 200, { concertsAvailable: Boolean(ticketmasterKey()), canEdit, ...(canEdit && { hasKey: Boolean(state.ticketmasterKey) }) });
    }
    if (req.method !== "POST") throw new EventsError(405, "Method not allowed.");
    if (!canEdit) throw new EventsError(403, "Only Navidrome admins can change this.");
    const key = String((await readJson(req)).ticketmasterKey ?? "").trim();
    if (key && !/^[A-Za-z0-9]{10,64}$/.test(key)) throw new EventsError(400, "That doesn't look like a Ticketmaster API key.");
    state.ticketmasterKey = key;
    // Look everyone's artists up again with the new key.
    for (const entry of Object.values(state.artists)) delete entry.concerts;
    save();
    refreshAll();
    return json(res, 200, { concertsAvailable: Boolean(ticketmasterKey()), canEdit, hasKey: Boolean(key), persisted: saving });
  }

  if (req.method === "GET") {
    if (sub === "") return json(res, 200, summary(username));
    throw new EventsError(404, "Not found.");
  }
  if (req.method !== "POST") throw new EventsError(405, "Method not allowed.");
  const body = await readJson(req);
  const user = userOf(username);

  if (sub === "follow") {
    const { id, name } = body;
    if (!isId(id) || typeof name !== "string" || !name.trim()) throw new EventsError(400, "Which artist?");
    const mbid = typeof body.mbid === "string" && /^[0-9a-f-]{36}$/.test(body.mbid) ? body.mbid : "";
    if (!user.artists.some((a) => a.id === id)) {
      if (user.artists.length >= MAX_ARTISTS) throw new EventsError(400, "That's too many artists.");
      user.artists.push({ id, name: name.trim().slice(0, 200), mbid, followedAt: Date.now() });
    }
  } else if (sub === "unfollow") {
    user.artists = user.artists.filter((a) => a.id !== body.id);
  } else if (sub === "settings") {
    const country = String(body.country ?? "").toUpperCase();
    if (country && !/^[A-Z]{2}$/.test(country)) throw new EventsError(400, "Unknown country.");
    user.country = country;
  } else if (sub === "seen") {
    user.lastVisit = Date.now();
  } else if (sub === "ics-token") {
    if (!user.icsToken || body.reset === true) user.icsToken = crypto.randomBytes(24).toString("base64url");
    save();
    return json(res, 200, { token: user.icsToken });
  } else {
    throw new EventsError(404, "Not found.");
  }
  save();
  return json(res, 200, summary(username));
}
