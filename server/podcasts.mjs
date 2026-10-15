// Podcasts: each person's subscribed shows and how far they got in each
// episode, so both follow them from device to device. Navidrome has no
// podcast support (its Subsonic podcast endpoints aren't implemented), so
// this server reads the shows' public RSS feeds itself; apps stream the
// episodes straight from the publisher, like any podcast app.
//
//   GET  /jam-api/podcasts                     { shows, progress }
//   GET  /jam-api/podcasts/search?q            shows from the Apple Podcasts directory
//   GET  /jam-api/podcasts/feed?url | ?id      a show and its episodes
//   GET  /jam-api/podcasts/latest              newest episodes of your shows
//   POST /jam-api/podcasts/subscribe           { feedUrl }
//   POST /jam-api/podcasts/unsubscribe         { id }
//   POST /jam-api/podcasts/progress            { id, position, duration, played? }
//
// Saved in $JAM_DATA_DIR/podcasts.json when it's set, else they only last
// until the server restarts.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

const DATA_DIR = process.env.JAM_DATA_DIR || "";
const PODCASTS_FILE = DATA_DIR ? path.join(DATA_DIR, "podcasts.json") : "";
/** Lets feeds on the local network through (they're refused by default: see safeFetch). */
const ALLOW_PRIVATE = process.env.PODCASTS_ALLOW_PRIVATE === "1";

const MAX_SHOWS = 300;
const MAX_PROGRESS = 5000;
const MAX_EPISODES = 1000;
const MAX_FEED_BYTES = 30 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20_000;
const FEED_TTL_MS = 15 * 60 * 1000;
const MAX_CACHED_FEEDS = 300;
const LATEST_COUNT = 60;
const LATEST_CONCURRENCY = 4;
const MAX_DESCRIPTION = 4000;

/**
 * @typedef {{ id: string, feedUrl: string, title: string, author: string, image: string, description?: string }} Show
 * @typedef {{ p: number, d: number, done: boolean, at: number }} Progress
 * @typedef {{ shows: (Show & { subscribedAt: number })[], progress: Record<string, Progress> }} UserPodcasts
 */

/** By username. @type {Map<string, UserPodcasts>} */
const data = load();
/** By feed URL. @type {Map<string, { at: number, feed: { show: Show, episodes: object[] } }>} */
const feedCache = new Map();
/** Show id → feed URL, for the feeds this server has read (so pages can link to a show by id). */
const feedUrls = new Map();

class PodcastError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function load() {
  try {
    if (PODCASTS_FILE) return new Map(Object.entries(JSON.parse(fs.readFileSync(PODCASTS_FILE, "utf8"))));
  } catch {
    // None saved yet.
  }
  return new Map();
}

let saveTimer = null;
/** False once a save failed (e.g. JAM_DATA_DIR isn't writable). */
let saving = Boolean(PODCASTS_FILE);
/** Writes everything out soon after a change (one write for a burst of changes). */
function save() {
  if (!PODCASTS_FILE || saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${PODCASTS_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(data)));
      fs.renameSync(tmp, PODCASTS_FILE);
      saving = true;
    } catch (err) {
      console.error("[podcasts] could not save:", err.message);
      saving = false;
    }
  }, 1000);
}

function mine(username) {
  let entry = data.get(username);
  if (!entry) {
    entry = { shows: [], progress: {} };
    data.set(username, entry);
  }
  return entry;
}

const hash = (s, n) => crypto.createHash("sha1").update(s).digest("hex").slice(0, n);
const showId = (feedUrl) => hash(feedUrl, 12);
const episodeId = (feedUrl, guid) => `ep:${hash(`${feedUrl}\n${guid}`, 16)}`;

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

// ---- fetching feeds ---------------------------------------------------------

// The server fetches URLs people give it, so it won't fetch addresses inside
// its own network (the router, other containers...) unless told to.
const privateRanges = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
]) {
  privateRanges.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
]) {
  privateRanges.addSubnet(addr, prefix, "ipv6");
}

function isPrivate(address) {
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return privateRanges.check(mapped[1], "ipv4");
  return privateRanges.check(address, net.isIPv6(address) ? "ipv6" : "ipv4");
}

function parseHttpUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new PodcastError(400, "That isn't a valid link.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new PodcastError(400, "Only http and https links work.");
  return url;
}

async function checkHost(url) {
  if (ALLOW_PRIVATE) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  try {
    addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  } catch {
    throw new PodcastError(502, `Couldn't find ${host}.`);
  }
  if (addresses.some((a) => isPrivate(a.address))) {
    throw new PodcastError(400, "That address is on a private network.");
  }
}

/** GETs a public URL, following redirects, and returns its body as text (up to `maxBytes`). */
async function safeFetch(raw, maxBytes = MAX_FEED_BYTES) {
  let url = parseHttpUrl(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await checkHost(url);
    let res;
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": "Spotifiak/1.0 (podcasts)", Accept: "application/rss+xml, application/xml, text/xml, */*" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new PodcastError(502, `Couldn't reach ${url.hostname}.`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = parseHttpUrl(new URL(res.headers.get("location"), url).href);
      continue;
    }
    if (!res.ok) throw new PodcastError(502, `${url.hostname} answered ${res.status}.`);
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > maxBytes) throw new PodcastError(502, "That feed is too big.");
      chunks.push(chunk);
    }
    return { text: Buffer.concat(chunks).toString("utf8"), finalUrl: url.href };
  }
  throw new PodcastError(502, "Too many redirects.");
}

// ---- reading RSS --------------------------------------------------------------

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        try {
          return String.fromCodePoint(code);
        } catch {
          return m;
        }
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

/** HTML show notes as plain text, keeping paragraphs. */
function toText(html) {
  const text = decode(
    html.replace(/<(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length > MAX_DESCRIPTION ? `${text.slice(0, MAX_DESCRIPTION)}…` : text;
}

function tagText(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decode(m[1]).trim() : "";
}

function attr(xml, tag, name) {
  const m = xml.match(new RegExp(`<${tag}\\s[^>]*?${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return m ? decode(m[1]).trim() : "";
}

/** "1:02:03", "62:03" or "3723" → seconds. */
function parseDuration(s) {
  if (!s) return 0;
  const parts = s.split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return Math.round(parts.reduce((total, n) => total * 60 + n, 0));
}

function parseFeed(xml, feedUrl) {
  if (!/<rss[\s>]|<channel[\s>]/i.test(xml)) throw new PodcastError(502, "That link isn't a podcast feed.");
  const firstItem = xml.search(/<item[\s>]/i);
  const channel = firstItem === -1 ? xml : xml.slice(0, firstItem);
  const id = showId(feedUrl);
  const show = {
    id,
    feedUrl,
    title: tagText(channel, "title") || "Untitled podcast",
    author: tagText(channel, "itunes:author") || tagText(channel, "managingEditor") || "",
    image: attr(channel, "itunes:image", "href") || tagText(channel.match(/<image[\s>][\s\S]*?<\/image>/i)?.[0] ?? "", "url"),
    description: toText(tagText(channel, "description") || tagText(channel, "itunes:summary")),
  };

  const episodes = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  for (let m; (m = itemRe.exec(xml)); ) {
    const item = m[1];
    const src = attr(item, "enclosure", "url");
    if (!src || !/^https?:\/\//i.test(src)) continue;
    const guid = tagText(item, "guid") || src;
    const published = Date.parse(tagText(item, "pubDate")) || 0;
    episodes.push({
      id: episodeId(feedUrl, guid),
      title: tagText(item, "title") || "Untitled episode",
      published,
      duration: parseDuration(tagText(item, "itunes:duration")),
      src,
      image: attr(item, "itunes:image", "href") || show.image,
      description: toText(tagText(item, "content:encoded") || tagText(item, "description") || tagText(item, "itunes:summary")),
      podcastId: id,
      show: show.title,
      author: show.author,
    });
  }
  episodes.sort((a, b) => b.published - a.published);
  return { show, episodes: episodes.slice(0, MAX_EPISODES) };
}

/** A feed, from the cache when it was read in the last few minutes. */
async function getFeed(feedUrl, { fresh = false } = {}) {
  const cached = feedCache.get(feedUrl);
  if (cached && !fresh && Date.now() - cached.at < FEED_TTL_MS) return cached.feed;
  const { text } = await safeFetch(feedUrl);
  const feed = parseFeed(text, feedUrl);
  feedCache.delete(feedUrl);
  feedCache.set(feedUrl, { at: Date.now(), feed });
  if (feedCache.size > MAX_CACHED_FEEDS) feedCache.delete(feedCache.keys().next().value);
  feedUrls.set(feed.show.id, feedUrl);
  return feed;
}

// ---- the directory ------------------------------------------------------------

async function search(term) {
  const query = new URLSearchParams({ media: "podcast", entity: "podcast", limit: "30", term });
  let res;
  try {
    res = await fetch(`https://itunes.apple.com/search?${query}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new PodcastError(502, "Couldn't reach the podcast directory.");
  }
  if (!res.ok) throw new PodcastError(502, `The podcast directory answered ${res.status}.`);
  const body = await res.json().catch(() => ({}));
  return (body.results ?? [])
    .filter((r) => typeof r.feedUrl === "string")
    .map((r) => {
      feedUrls.set(showId(r.feedUrl), r.feedUrl);
      return {
        id: showId(r.feedUrl),
        feedUrl: r.feedUrl,
        title: String(r.collectionName ?? ""),
        author: String(r.artistName ?? ""),
        image: String(r.artworkUrl600 ?? r.artworkUrl100 ?? ""),
      };
    });
}

// ---- routes ---------------------------------------------------------------------

/**
 * Handles /jam-api/podcasts/* for an authenticated Navidrome user.
 * @param {{ readJson: (req: import("node:http").IncomingMessage) => Promise<any> }} deps
 */
export async function handlePodcasts(req, res, url, username, { readJson }) {
  try {
    await route(req, res, url, username, readJson);
  } catch (err) {
    if (!(err instanceof PodcastError)) throw err;
    json(res, err.status, { error: err.message });
  }
}

function summary(username) {
  const entry = data.get(username) ?? { shows: [], progress: {} };
  return { shows: entry.shows, progress: entry.progress, persisted: saving };
}

async function route(req, res, url, username, readJson) {
  const sub = url.pathname.replace(/^\/jam-api\/podcasts\/?/, "").replace(/\/$/, "");

  if (req.method === "GET") {
    if (sub === "") return json(res, 200, summary(username));

    if (sub === "search") {
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
      if (!q) return json(res, 200, { results: [] });
      // A link to a feed is that show.
      if (/^https?:\/\//i.test(q)) {
        const { show } = await getFeed(q);
        return json(res, 200, { results: [show] });
      }
      return json(res, 200, { results: await search(q) });
    }

    if (sub === "feed") {
      const id = url.searchParams.get("id") ?? "";
      const feedUrl =
        url.searchParams.get("url") ||
        mine(username).shows.find((s) => s.id === id)?.feedUrl ||
        feedUrls.get(id);
      if (!feedUrl) throw new PodcastError(404, "Podcast not found.");
      return json(res, 200, await getFeed(feedUrl, { fresh: url.searchParams.get("fresh") === "1" }));
    }

    if (sub === "latest") {
      const shows = [...mine(username).shows];
      const episodes = [];
      const failed = [];
      const worker = async () => {
        for (let show; (show = shows.shift()); ) {
          try {
            episodes.push(...(await getFeed(show.feedUrl)).episodes.slice(0, LATEST_COUNT));
          } catch {
            failed.push(show.id);
          }
        }
      };
      await Promise.all(Array.from({ length: LATEST_CONCURRENCY }, worker));
      episodes.sort((a, b) => b.published - a.published);
      return json(res, 200, { episodes: episodes.slice(0, LATEST_COUNT), failed });
    }

    throw new PodcastError(404, "Not found.");
  }

  if (req.method !== "POST") throw new PodcastError(405, "Method not allowed.");
  const body = await readJson(req);
  const entry = mine(username);

  if (sub === "subscribe") {
    const { show } = await getFeed(parseHttpUrl(body.feedUrl).href);
    if (!entry.shows.some((s) => s.id === show.id)) {
      if (entry.shows.length >= MAX_SHOWS) throw new PodcastError(400, "That's too many podcasts.");
      const { id, feedUrl, title, author, image } = show;
      entry.shows.unshift({ id, feedUrl, title, author, image, subscribedAt: Date.now() });
    }
    save();
    return json(res, 200, summary(username));
  }

  if (sub === "unsubscribe") {
    entry.shows = entry.shows.filter((s) => s.id !== body.id);
    save();
    return json(res, 200, summary(username));
  }

  if (sub === "progress") {
    const id = body.id;
    if (typeof id !== "string" || !/^ep:[0-9a-f]{16}$/.test(id)) throw new PodcastError(400, "Unknown episode.");
    const num = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);
    const previous = entry.progress[id];
    const done = typeof body.played === "boolean" ? body.played : (previous?.done ?? false);
    entry.progress[id] = {
      p: done ? 0 : num(body.position),
      d: num(body.duration) || previous?.d || 0,
      done,
      at: Date.now(),
    };
    // Forget the oldest when there are too many.
    const ids = Object.keys(entry.progress);
    if (ids.length > MAX_PROGRESS) {
      ids.sort((a, b) => entry.progress[a].at - entry.progress[b].at);
      for (const old of ids.slice(0, ids.length - MAX_PROGRESS)) delete entry.progress[old];
    }
    save();
    return json(res, 200, { progress: entry.progress[id] });
  }

  throw new PodcastError(404, "Not found.");
}
