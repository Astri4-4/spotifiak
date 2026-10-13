import { authSearchParams } from "./client";
import { jamBase } from "@/lib/servers";
import type { JamTrack } from "./jam";

// Client for the Jam server's device endpoints (/jam-api/me, server/jam.mjs):
// the devices of this account, what the playing one plays, and commands
// between them - see ConnectContext.

export type RemoteRepeat = "off" | "all" | "one";

export interface ConnectDevice {
  id: string;
  name: string;
  platform: string;
}

export interface RemotePlayback {
  queue: JamTrack[];
  index: number;
  playing: boolean;
  /** Seconds, as of `positionAt` on the active device record. */
  position: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RemoteRepeat;
}

export interface ActiveDevice {
  deviceId: string;
  state: RemotePlayback;
  /** Server clock (ms) when `state.position` was true. */
  positionAt: number;
}

export interface DevicesSnapshot {
  devices: ConnectDevice[];
  active: ActiveDevice | null;
  /** Server clock (ms) when sent, for clock-offset estimation. */
  now: number;
}

export type ConnectCommand =
  | { type: "play" | "pause" | "next" | "previous" }
  | { type: "transfer" }
  | { type: "seek"; position: number }
  | { type: "setVolume"; volume: number }
  | { type: "setShuffle"; value: boolean }
  | { type: "setRepeat"; value: RemoteRepeat }
  | { type: "playQueue"; tracks: JamTrack[]; startIndex: number }
  | { type: "enqueue"; tracks: JamTrack[] };

/** A command as received, with the state to resume for "transfer". */
export type ReceivedCommand =
  | Exclude<ConnectCommand, { type: "transfer" }>
  | { type: "transfer"; state: RemotePlayback };

/** Base URL of the device endpoints, or null without a Jam server (mobile app with none set). */
function base(): string | null {
  const jam = jamBase();
  return jam === null ? null : `${jam}/jam-api/me`;
}

/** Whether devices can connect: there's a Jam server to go through. */
export function connectAvailable(): boolean {
  return base() !== null;
}

/** Needs to be logged in (throws AuthError otherwise). */
export function deviceEventsUrl(device: ConnectDevice): string | null {
  const b = base();
  if (b === null) return null;
  return `${b}/events?${authSearchParams({ deviceId: device.id, name: device.name, platform: device.platform })}`;
}

async function post(path: string, deviceId: string, body: unknown): Promise<void> {
  const b = base();
  if (b === null) return;
  const res = await fetch(`${b}/${path}?${authSearchParams({ deviceId })}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Device request failed (${res.status}).`);
}

/** Publishes this device's playback; `claim` makes it the active device even while paused. */
export function publishPlayback(deviceId: string, state: RemotePlayback, claim = false): Promise<void> {
  return post("state", deviceId, { state, claim });
}

export function sendCommand(deviceId: string, target: string, command: ConnectCommand): Promise<void> {
  return post("commands", deviceId, { target, command });
}
