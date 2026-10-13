// Live updates for the desktop app: newer builds of the web app, downloaded
// from GitHub Releases into the user-data directory and served instead of
// the bundled dist/ from the next launch. Only the web app is updated; a new
// Electron shell still needs a new installer (see `minShellVersion`).
//
// Safety net: a downloaded bundle is "on trial" until the page reports it
// started (update:ready). If it doesn't within TRIAL_TIMEOUT_MS, or the app
// is launched again while it's still on trial, it's marked bad and the last
// bundle that did start is served instead (or the bundled one).

import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { compareVersions, fetchLatestBundle } from "../shared/releases.mjs";
import { extractZip } from "./zip.mjs";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
/** Version of the web app bundled with this install (also the shell's version). Read
 *  from package.json rather than app.getVersion(), which falls back to
 *  Electron's own version when the app is launched unpackaged. */
const BUILTIN_VERSION = pkg.version;
const TRIAL_TIMEOUT_MS = 15_000;
// For testing against a fake GitHub API (e.g. http://127.0.0.1:4600).
const API_BASE = process.env.SPOTIFIAK_UPDATES_API || undefined;

const updatesDir = () => path.join(app.getPath("userData"), "updates");
const statePath = () => path.join(updatesDir(), "state.json");
const bundleDir = (version) => path.join(updatesDir(), version);

/**
 * active: downloaded bundle to serve; trial: served but not confirmed yet;
 * good: last downloaded bundle that started fine; bad: never use again.
 * @type {{ active: string | null, trial: string | null, good: string | null, bad: string[] }}
 */
let state = { active: null, trial: null, good: null, bad: [] };
/** Version of the web app being served this session. */
let runningVersion = "";
/** @type {{ phase: "idle" | "checking" | "downloading" | "up-to-date" | "ready" | "error", version?: string, message?: string }} */
let status = { phase: "idle" };
/** @type {Promise<void> | null} */
let checking = null;
/** @type {(status: ReturnType<typeof getStatus>) => void} */
let onStatusChange = () => {};

function setStatus(next) {
  status = next;
  onStatusChange(getStatus());
}

/** Calls `listener` whenever the update status changes (to tell the window). */
export function onUpdateStatus(listener) {
  onStatusChange = listener;
}

function saveState() {
  fs.mkdirSync(updatesDir(), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

/** Marks the bundle on trial as bad and goes back to the last one that started. */
function rejectTrial() {
  console.warn(`[updates] ${state.trial} didn't start; going back to the previous version.`);
  state.bad.push(state.trial);
  if (state.active === state.trial) state.active = state.good;
  if (state.trial !== runningVersion) fs.rmSync(bundleDir(state.trial), { recursive: true, force: true });
  state.trial = null;
  saveState();
}

/** Picks the web app to serve this session: a downloaded update if it's newer and healthy, else `bundledDir`. */
export function resolveWebRoot(bundledDir) {
  try {
    state = { ...state, ...JSON.parse(fs.readFileSync(statePath(), "utf8")) };
  } catch {
    // No updates downloaded yet.
  }
  if (state.trial) rejectTrial();
  return pickWebRoot(bundledDir);
}

function pickWebRoot(bundledDir) {
  const builtin = BUILTIN_VERSION;
  const active = state.active;
  if (active && compareVersions(active, builtin) > 0 && fs.existsSync(path.join(bundleDir(active), "index.html"))) {
    state.trial = active;
    saveState();
    runningVersion = active;
    return bundleDir(active);
  }
  runningVersion = builtin;
  return bundledDir;
}

/**
 * If the bundle being served is on trial and doesn't confirm in time, rejects
 * it and calls `onRollback` with the web root to serve instead (to reload).
 */
export function watchTrial(bundledDir, onRollback) {
  if (!state.trial) return;
  setTimeout(() => {
    if (!state.trial) return;
    const rejected = state.trial;
    rejectTrial();
    onRollback(pickWebRoot(bundledDir));
    // It was in use until now, so rejectTrial() left its files.
    fs.rmSync(bundleDir(rejected), { recursive: true, force: true });
  }, TRIAL_TIMEOUT_MS);
}

/** The page started fine: keep this bundle. */
export function markReady() {
  if (!state.trial) return;
  state.good = state.trial;
  state.trial = null;
  saveState();
}

export function getStatus() {
  return { ...status, current: runningVersion };
}

/** Looks for a newer web app and downloads it; it's used from the next launch. */
export function checkForUpdates() {
  checking ??= check().finally(() => {
    checking = null;
  });
  return checking.then(getStatus);
}

async function check() {
  setStatus({ phase: "checking" });
  try {
    const latest = await fetchLatestBundle(pkg.updates.github, API_BASE);
    if (!latest || compareVersions(latest.version, runningVersion) <= 0 || state.bad.includes(latest.version)) {
      setStatus({ phase: "up-to-date" });
      return;
    }
    if (compareVersions(latest.minShellVersion, BUILTIN_VERSION) > 0) {
      setStatus({
        phase: "error",
        version: latest.version,
        message: `Version ${latest.version} needs a new install of the app: download it from GitHub Releases.`,
      });
      return;
    }
    if (state.active !== latest.version || !fs.existsSync(path.join(bundleDir(latest.version), "index.html"))) {
      setStatus({ phase: "downloading", version: latest.version });
      const res = await fetch(latest.url);
      if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
      // Extract next to the final location, then swap it in, so a failed
      // download never leaves a half-written bundle behind.
      const temp = `${bundleDir(latest.version)}.partial`;
      fs.rmSync(temp, { recursive: true, force: true });
      fs.mkdirSync(temp, { recursive: true });
      extractZip(Buffer.from(await res.arrayBuffer()), temp);
      if (!fs.existsSync(path.join(temp, "index.html"))) throw new Error("The update has no index.html.");
      fs.rmSync(bundleDir(latest.version), { recursive: true, force: true });
      fs.renameSync(temp, bundleDir(latest.version));
      state.active = latest.version;
      saveState();
      removeOldBundles();
    }
    setStatus({ phase: "ready", version: latest.version });
  } catch (err) {
    console.error("[updates]", err);
    setStatus({ phase: "error", message: `Couldn't check for updates: ${err instanceof Error ? err.message : err}` });
  }
}

/** Keeps only the bundle being served, the one waiting for the next launch, and the last good one. */
function removeOldBundles() {
  const keep = [state.active, state.good, runningVersion];
  for (const entry of fs.readdirSync(updatesDir(), { withFileTypes: true })) {
    if (entry.isDirectory() && !keep.includes(entry.name)) {
      fs.rmSync(path.join(updatesDir(), entry.name), { recursive: true, force: true });
    }
  }
}

/** Restarts the app into the downloaded update. */
export function applyUpdate() {
  app.relaunch();
  app.exit(0);
}
