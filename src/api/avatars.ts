import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";

// Client for profile pictures (server/avatars.mjs), kept by the Jam server.

export class AvatarError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "AvatarError";
  }
}

function base(): string {
  const b = jamBase();
  if (b === null) throw new AvatarError(503, "Profile pictures need a Jam server. Set one in Settings.");
  return `${b}/jam-api/avatars`;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}?${authSearchParams()}`, init);
  } catch {
    throw new AvatarError(0, "Couldn't reach the server.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new AvatarError(res.status, data?.error ?? `Request failed (${res.status}).`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Who has a picture, with its version (changes when it's replaced). */
export async function getAvatarVersions(): Promise<Record<string, number>> {
  return (await call<{ avatars: Record<string, number> }>("")).avatars;
}

/** Sets your picture: a JPEG, already cropped and shrunk. Resolves to its version. */
export async function uploadAvatar(jpeg: Blob): Promise<number> {
  return (await call<{ version: number }>("", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: jpeg })).version;
}

export function removeAvatar(): Promise<void> {
  return call("/remove", { method: "POST" });
}

export function avatarUrl(username: string, version: number): string {
  return `${base()}/${encodeURIComponent(username)}?${authSearchParams({ v: version })}`;
}
