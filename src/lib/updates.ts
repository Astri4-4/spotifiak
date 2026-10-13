import { useSyncExternalStore } from "react";
import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater, type BundleInfo } from "@capgo/capacitor-updater";
import { compareVersions, fetchLatestBundle } from "../../shared/releases.mjs";

// Live updates: the desktop and mobile apps download newer builds of this web
// app from GitHub Releases and switch to them on the next launch, without
// reinstalling. Native/Electron shell changes still need a new install; a
// release says which shells can run it with `updates.minShellVersion` in
// package.json.
//
// - Desktop: done by the main process (electron/updates.mjs) over the bridge.
// - Android/iOS: @capgo/capacitor-updater in manual mode, so it only ever
//   downloads what we hand it (no Capgo cloud; see capacitor.config.ts). It
//   rolls back a bundle that doesn't call notifyAppReady() at startup.

export type UpdatePhase = "idle" | "checking" | "downloading" | "up-to-date" | "ready" | "error";

export interface UpdateStatus {
  phase: UpdatePhase;
  /** The version being downloaded / ready to use. */
  version?: string;
  message?: string;
}

export interface DesktopUpdatesBridge {
  ready(): Promise<void>;
  status(): Promise<UpdateStatus & { current: string }>;
  check(): Promise<UpdateStatus & { current: string }>;
  apply(): Promise<void>;
  onStatus(listener: (status: UpdateStatus & { current: string }) => void): () => void;
}

const UPDATE_REPO: string = __UPDATE_REPO__;
/** Delay before the background check on mobile, so it doesn't compete with startup. */
const CHECK_DELAY_MS = 5000;

const desktop = window.desktop?.updates;
const isNative = Capacitor.isNativePlatform();

/** Whether this build can update itself (not in a plain browser, where the server serves the latest). */
export const updatesSupported = Boolean(desktop) || isNative;

let status: UpdateStatus = { phase: "idle" };
const listeners = new Set<() => void>();

function setStatus(next: UpdateStatus) {
  status = next;
  for (const l of listeners) l();
}

/** Confirms this bundle started fine, and checks for updates in the background. Call once at startup. */
export function initUpdates() {
  if (desktop) {
    // The main process checks by itself shortly after launch and reports progress.
    void desktop.ready();
    desktop.onStatus(setStatus);
    void desktop.status().then(setStatus);
  } else if (isNative) {
    void CapacitorUpdater.notifyAppReady();
    window.setTimeout(() => void checkForUpdates(), CHECK_DELAY_MS);
  }
}

export async function checkForUpdates(): Promise<void> {
  if (status.phase === "checking" || status.phase === "downloading") return;
  if (desktop) {
    setStatus({ phase: "checking" });
    setStatus(await desktop.check());
  } else if (isNative) {
    await checkNative();
  }
}

/** Mobile: the bundle that will be used from the next launch, if one is waiting. */
let nextBundle: BundleInfo | null = null;

async function checkNative() {
  setStatus({ phase: "checking" });
  try {
    const latest = await fetchLatestBundle(UPDATE_REPO);
    if (!latest || compareVersions(latest.version, __APP_VERSION__) <= 0) {
      setStatus({ phase: "up-to-date" });
      return;
    }
    const { native } = await CapacitorUpdater.current();
    if (compareVersions(latest.minShellVersion, native) > 0) {
      setStatus({
        phase: "error",
        version: latest.version,
        message: `Version ${latest.version} needs a new install of the app: download it from GitHub Releases.`,
      });
      return;
    }

    const { bundles } = await CapacitorUpdater.list();
    // A version that failed to start before is skipped (the plugin rolled it back).
    if (bundles.some((b) => b.version === latest.version && b.status === "error")) {
      setStatus({ phase: "up-to-date" });
      return;
    }
    let bundle = bundles.find((b) => b.version === latest.version && b.status === "success");
    if (!bundle) {
      setStatus({ phase: "downloading", version: latest.version });
      bundle = await CapacitorUpdater.download({ url: latest.url, version: latest.version });
    }
    // Used the next time the app goes to the background or restarts.
    nextBundle = await CapacitorUpdater.next({ id: bundle.id });
    setStatus({ phase: "ready", version: latest.version });
  } catch (err) {
    setStatus({ phase: "error", message: `Couldn't check for updates: ${err instanceof Error ? err.message : String(err)}` });
  }
}

/** Restarts into the downloaded update now. */
export async function applyUpdate(): Promise<void> {
  if (desktop) {
    await desktop.apply();
  } else if (isNative && nextBundle) {
    await CapacitorUpdater.set({ id: nextBundle.id });
  }
}

export function useUpdateStatus(): UpdateStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => status,
  );
}
