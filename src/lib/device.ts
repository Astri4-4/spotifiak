import { Capacitor } from "@capacitor/core";

// This app instance as a device of the account (see ConnectContext).

const ID_KEY = "spotifion.device.id";
const NAME_KEY = "spotifion.device.name";

/** Per tab/app session, so two browser tabs are two devices. */
export function getDeviceId(): string {
  try {
    let id = sessionStorage.getItem(ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** "desktop" | "ios" | "android" | "web": picks the device's icon. */
export function getDevicePlatform(): string {
  if (window.desktop) return "desktop";
  const native = Capacitor.getPlatform();
  return native === "ios" || native === "android" ? native : "web";
}

function osName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  if (/Linux/.test(ua)) return "Linux";
  return "computer";
}

function browserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Browser";
}

/** A sensible default name, e.g. "Mac", "iPhone", "Chrome on Windows". */
export function defaultDeviceName(): string {
  const platform = getDevicePlatform();
  const os = osName();
  if (platform === "desktop") return os === "Windows" || os === "Linux" ? `${os} PC` : os;
  if (platform === "ios" || platform === "android") return os === "Android" ? "Android phone" : os;
  return `${browserName()} on ${os}`;
}

/** The name the user gave this device, or the default one. */
export function getDeviceName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || defaultDeviceName();
  } catch {
    return defaultDeviceName();
  }
}

export function setDeviceName(name: string) {
  try {
    if (name.trim()) localStorage.setItem(NAME_KEY, name.trim().slice(0, 60));
    else localStorage.removeItem(NAME_KEY);
  } catch {
    // Not saved: the default name keeps being used.
  }
}
