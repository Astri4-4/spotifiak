// Desktop shell: wraps the built web app (dist/) in an Electron window.
//
// The web app expects to be served next to two same-origin proxies - /rest
// (Navidrome's Subsonic API) and /jam-api (the Jam server) - which nginx
// provides in the Docker image. Here a tiny local HTTP server on 127.0.0.1
// plays nginx's role, so the React code runs unchanged. Its upstreams come
// from config.json in the user-data directory, edited from the login and
// settings screens through the bridge in preload.cjs.

import { app, BrowserWindow, ipcMain, shell } from "electron";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");

// A fixed port keeps the page origin (and so localStorage, i.e. the login)
// stable across launches. If it's taken we fall back to a random one.
const PREFERRED_PORT = 47821;

const DEFAULT_CONFIG = {
  navidromeUrl: "https://navidrome.sachaguerin.fr",
  // Base URL of a Spotifiak web deployment, whose /jam-api the app uses so
  // desktop and web users share the same Jams. Empty disables Jam.
  jamUrl: "",
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// ---- config -------------------------------------------------------------

const configPath = () => path.join(app.getPath("userData"), "config.json");

let config = { ...DEFAULT_CONFIG };

function loadConfig() {
  try {
    config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configPath(), "utf8")) };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
}

/** Trims and validates an http(s) base URL; "" stays "" when `optional`. */
function normaliseUrl(value, label, optional) {
  const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed && optional) return "";
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${label} isn't a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must start with http:// or https://.`);
  }
  return trimmed;
}

function saveConfig(next) {
  config = {
    navidromeUrl: normaliseUrl(next.navidromeUrl, "Navidrome server", false),
    jamUrl: normaliseUrl(next.jamUrl, "Jam server", true),
  };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  return config;
}

// ---- local server ---------------------------------------------------------

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Streams the request through to `base` + the original path, like nginx's proxy_pass. */
function proxy(req, res, base) {
  const target = new URL(base + req.url);
  const headers = { ...req.headers, host: target.host };
  delete headers.origin;
  delete headers.referer;

  const client = target.protocol === "https:" ? https : http;
  const upstream = client.request(target, { method: req.method, headers }, (upRes) => {
    res.writeHead(upRes.statusCode ?? 502, upRes.headers);
    upRes.pipe(res);
  });
  upstream.on("error", (err) => {
    console.error(`[proxy] ${target.origin}: ${err.message}`);
    if (!res.headersSent) sendJson(res, 502, { error: `Couldn't reach ${target.origin}.` });
    else res.destroy();
  });
  // Stop long-lived upstream requests (audio streams, Jam's SSE) once the
  // page lets go of them.
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
}

function serveStatic(req, res) {
  const { pathname } = new URL(req.url, "http://localhost");
  let file = path.join(DIST_DIR, path.normalize(decodeURIComponent(pathname)));
  if (!file.startsWith(DIST_DIR)) return sendJson(res, 403, { error: "Forbidden" });

  let stat = fs.statSync(file, { throwIfNoEntry: false });
  // Single-page app: let React Router handle unknown paths.
  if (!stat?.isFile()) {
    file = path.join(DIST_DIR, "index.html");
    stat = fs.statSync(file);
  }
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(file)] ?? "application/octet-stream",
    "Content-Length": stat.size,
  });
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

function handle(req, res) {
  if (req.url.startsWith("/rest/")) return proxy(req, res, config.navidromeUrl);
  if (req.url.startsWith("/jam-api/")) {
    if (!config.jamUrl) {
      return sendJson(res, 503, {
        error: "Jam needs a Jam server. Set one in Settings.",
      });
    }
    return proxy(req, res, config.jamUrl);
  }
  if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Method not allowed" });
  serveStatic(req, res);
}

function startServer() {
  const server = http.createServer((req, res) => {
    try {
      handle(req, res);
    } catch (err) {
      console.error("[server]", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Internal error." });
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", (err) => {
      if (err.code !== "EADDRINUSE") return reject(err);
      server.listen(0, "127.0.0.1");
    });
    server.once("listening", () => resolve(server.address().port));
    server.listen(PREFERRED_PORT, "127.0.0.1");
  });
}

// ---- window ---------------------------------------------------------------

let mainWindow = null;
let appOrigin = "";

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 500,
    backgroundColor: "#000000",
    title: "Spotifiak",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Anything that isn't the app itself opens in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin === appOrigin) return;
    event.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(`${appOrigin}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    loadConfig();
    ipcMain.handle("config:get", () => config);
    ipcMain.handle("config:set", (_event, next) => saveConfig(next));

    const port = await startServer();
    appOrigin = `http://127.0.0.1:${port}`;
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
