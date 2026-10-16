import { useEffect, useSyncExternalStore } from "react";
import { nameKey } from "./names";
import { avatarUrl, getAvatarVersions, removeAvatar, uploadAvatar } from "@/api/avatars";

// Everyone's profile picture versions, fetched once and refreshed now and
// then, shared by every <Avatar>.

/** Pictures size (px) apps upload: square, enough for a retina 128px circle. */
const SIZE = 256;
const REFRESH_MS = 5 * 60 * 1000;

let versions: Record<string, number> = {};
let lastLoad = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function load(force = false) {
  if (loading || (!force && Date.now() - lastLoad < REFRESH_MS)) return;
  lastLoad = Date.now();
  loading = getAvatarVersions()
    .then((v) => {
      versions = v;
      notify();
    })
    .catch(() => void 0) // No Jam server, or it's down: initials it is.
    .finally(() => (loading = null));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The URL of `username`'s picture, or null if they have none. */
export function useAvatarUrl(username: string | null | undefined): string | null {
  const all = useSyncExternalStore(subscribe, () => versions);
  useEffect(() => load(), []);
  const key = username ? nameKey(username) : null;
  const version = key ? all[key] : undefined;
  if (!key || version === undefined) return null;
  try {
    return avatarUrl(key, version);
  } catch {
    return null;
  }
}

/** Crops the middle square of an image file and shrinks it to a SIZE x SIZE JPEG. */
async function toSquareJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file isn't a picture this device can read.");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  // Transparent pictures get a dark background rather than JPEG's black.
  ctx.fillStyle = "#282828";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process the picture."))), "image/jpeg", 0.85),
  );
}

export async function setMyAvatar(username: string, file: File): Promise<void> {
  const version = await uploadAvatar(await toSquareJpeg(file));
  versions = { ...versions, [username]: version };
  notify();
}

export async function removeMyAvatar(username: string): Promise<void> {
  await removeAvatar();
  const rest = { ...versions };
  delete rest[username];
  versions = rest;
  notify();
}
