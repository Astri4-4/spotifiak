import { Capacitor } from "@capacitor/core";
import type { DesktopUpdatesBridge } from "./updates";

// Which Navidrome and Jam servers the app talks to.
//
// - Browser (Docker/Kubernetes, `vite dev`): fixed by the deployment. The app
//   calls /rest and /jam-api on its own origin and nginx/Vite proxy them.
// - Desktop (Electron): same relative URLs, proxied by the local server in
//   electron/main.mjs, whose upstreams are set through `window.desktop`.
// - Mobile (Capacitor): there's no proxy, so requests go to the configured
//   servers' full URLs, saved on the device.

export interface ServerConfig {
  navidromeUrl: string;
  /** Base URL of a web deployment whose Jam server the app uses; "" disables Jam. */
  jamUrl: string;
}

interface DesktopBridge {
  getConfig(): Promise<ServerConfig>;
  /** Rejects with a readable message if a URL is invalid. */
  setConfig(config: ServerConfig): Promise<ServerConfig>;
  /** Live updates (electron/updates.mjs); missing in desktop apps older than the feature. */
  updates?: DesktopUpdatesBridge;
}

declare global {
  interface Window {
    /** Set by electron/preload.cjs in the desktop app. */
    desktop?: DesktopBridge;
  }
}

const desktop = window.desktop;
const isNative = Capacitor.isNativePlatform();

/** True when the user picks the servers (desktop and mobile apps). */
export const serversConfigurable = Boolean(desktop) || isNative;

const STORAGE_KEY = "spotifion.servers";
const DEFAULT_CONFIG: ServerConfig = {
  navidromeUrl: "https://navidrome.sachaguerin.fr",
  jamUrl: "",
};

function loadNativeConfig(): ServerConfig {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

let nativeConfig = isNative ? loadNativeConfig() : DEFAULT_CONFIG;

/** Trims and validates an http(s) base URL; "" stays "" when `optional`. Mirrors electron/main.mjs. */
function normaliseUrl(value: string, label: string, optional: boolean): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed && optional) return "";
  let url: URL;
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

export async function getServerConfig(): Promise<ServerConfig> {
  if (desktop) return desktop.getConfig();
  return nativeConfig;
}

/** Saves the servers to use; throws an Error with a readable message if a URL is invalid. */
export async function setServerConfig(config: ServerConfig): Promise<void> {
  if (desktop) {
    try {
      await desktop.setConfig(config);
    } catch (err) {
      // Electron prefixes errors thrown in IPC handlers; keep only the message.
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ""));
    }
    return;
  }
  nativeConfig = {
    navidromeUrl: normaliseUrl(config.navidromeUrl, "Navidrome server", false),
    jamUrl: normaliseUrl(config.jamUrl, "Jam server", true),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nativeConfig));
}

/** Prefix for Subsonic URLs: "" means same-origin /rest. */
export function navidromeBase(): string {
  return isNative ? nativeConfig.navidromeUrl : "";
}

/** Prefix for Jam server URLs, or null if the mobile app has no Jam server set. */
export function jamBase(): string | null {
  if (!isNative) return "";
  return nativeConfig.jamUrl || null;
}

/** Origin for Jam invite links: the web app people can open them in, or "" if unknown. */
export async function jamInviteOrigin(): Promise<string> {
  if (!serversConfigurable) return window.location.origin;
  return (await getServerConfig()).jamUrl;
}
