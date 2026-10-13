import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { useLocalPlayer, type PlayerContextValue, type RepeatMode } from "./LocalPlayer";
import { toJamTrack } from "@/api/jam";
import {
  connectAvailable,
  deviceEventsUrl,
  publishPlayback,
  sendCommand,
  type ActiveDevice,
  type ConnectCommand,
  type ConnectDevice,
  type DevicesSnapshot,
  type ReceivedCommand,
  type RemotePlayback,
} from "@/api/connect";
import { getDeviceId, getDeviceName, getDevicePlatform, setDeviceName } from "@/lib/device";
import type { Child } from "@/types/subsonic";

// Connect: every open app signed in to the same account is a device, like
// Spotify Connect. The device that plays publishes what it plays (through the
// Jam server's /jam-api/me endpoints); the others show it and control it, and
// any of them can move playback to itself or another device. Only one device
// plays at a time.
//
// This provider sits on top of this device's own player (LocalPlayer) and
// provides the player the app sees, usePlayer(): the local one, or a remote
// control for the account's playing device when that's another one. A device
// in a Jam just follows the Jam.

interface ConnectContextValue {
  /** False without a Jam server (e.g. not set in the mobile app). */
  available: boolean;
  thisDevice: ConnectDevice;
  /** This account's connected devices, this one included. */
  devices: ConnectDevice[];
  /** The device whose playback is shown, if it's another one. */
  remoteDevice: ConnectDevice | null;
  /** Moves the current playback to `deviceId` (possibly this device). */
  transferTo: (deviceId: string) => void;
  renameDevice: (name: string) => void;
}

const ConnectContext = createContext<ConnectContextValue | undefined>(undefined);
const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

/** Queues sent to the server are capped there; keep a window around the current track. */
const MAX_PUBLISHED_QUEUE = 500;
/** Wait for state changes to settle (e.g. dragging the volume) before publishing. */
const PUBLISH_DEBOUNCE_MS = 200;
const RECONNECT_DELAY_MS = 5000;
const REPEAT_ORDER: RepeatMode[] = ["off", "all", "one"];

export function ConnectProvider({ children }: { children: ReactNode }) {
  const local = useLocalPlayer();
  const { isAuthenticated } = useAuth();
  const deviceId = useMemo(getDeviceId, []);
  const [deviceName, setName] = useState(getDeviceName);
  const thisDevice = useMemo<ConnectDevice>(
    () => ({ id: deviceId, name: deviceName, platform: getDevicePlatform() }),
    [deviceId, deviceName],
  );
  const [snapshot, setSnapshot] = useState<DevicesSnapshot | null>(null);
  const offsetRef = useRef(0); // server clock - local clock, in ms
  const available = connectAvailable();

  const localRef = useRef(local);
  localRef.current = local;

  // ---- commands from other devices, run on the local player ---------------

  const claimNextPublishRef = useRef(false);

  const runCommand = useCallback((command: ReceivedCommand) => {
    const p = localRef.current;
    if (p.inJam) return; // a device in a Jam follows the Jam
    switch (command.type) {
      case "play":
        if (!p.isPlaying) p.togglePlay();
        break;
      case "pause":
        if (p.isPlaying) p.togglePlay();
        break;
      case "next":
        p.playNext();
        break;
      case "previous":
        p.playPrevious();
        break;
      case "seek":
        p.seek(command.position);
        break;
      case "setVolume":
        p.setVolume(command.volume);
        break;
      case "setShuffle":
        if (p.shuffle !== command.value) p.toggleShuffle();
        break;
      case "setRepeat": {
        const steps = (REPEAT_ORDER.indexOf(command.value) - REPEAT_ORDER.indexOf(p.repeat) + 3) % 3;
        for (let i = 0; i < steps; i++) p.cycleRepeat();
        break;
      }
      case "playQueue":
        p.playQueue(command.tracks as Child[], command.startIndex);
        break;
      case "enqueue":
        p.enqueue(command.tracks as Child[]);
        break;
      case "addNext":
        p.addNext(command.tracks as Child[]);
        break;
      case "jump":
        p.jumpTo(p.currentIndex + command.offset);
        break;
      case "remove":
        p.removeAt(p.currentIndex + command.offset);
        break;
      case "move":
        p.moveTrack(p.currentIndex + command.from, p.currentIndex + command.to);
        break;
      case "transfer": {
        const { state } = command;
        if (state.index < 0) break;
        // Take over even if it's paused, so the other devices show this one.
        claimNextPublishRef.current = true;
        p.playQueue(state.queue as Child[], state.index, { position: state.position, paused: !state.playing });
        p.setVolume(state.volume);
        if (p.shuffle !== state.shuffle) p.toggleShuffle();
        const steps = (REPEAT_ORDER.indexOf(state.repeat) - REPEAT_ORDER.indexOf(p.repeat) + 3) % 3;
        for (let i = 0; i < steps; i++) p.cycleRepeat();
        break;
      }
    }
  }, []);

  // ---- connection -----------------------------------------------------------

  useEffect(() => {
    if (!isAuthenticated) return;
    const url = deviceEventsUrl(thisDevice);
    if (!url) return;
    let es: EventSource | null = null;
    let retryTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      es = new EventSource(url);
      es.addEventListener("devices", (e: MessageEvent<string>) => {
        const snap = JSON.parse(e.data) as DevicesSnapshot;
        offsetRef.current = snap.now - Date.now();
        setSnapshot(snap);
      });
      es.addEventListener("ping", (e: MessageEvent<string>) => {
        offsetRef.current = (JSON.parse(e.data) as { now: number }).now - Date.now();
      });
      es.addEventListener("command", (e: MessageEvent<string>) => {
        runCommand((JSON.parse(e.data) as { command: ReceivedCommand }).command);
      });
      es.onerror = () => {
        if (disposed || es?.readyState !== EventSource.CLOSED) return; // EventSource retries by itself
        setSnapshot(null);
        retryTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();
    return () => {
      disposed = true;
      es?.close();
      window.clearTimeout(retryTimer);
      setSnapshot(null);
    };
  }, [isAuthenticated, thisDevice, runCommand]);

  const active: ActiveDevice | null = snapshot?.active ?? null;
  const thisIsActive = active?.deviceId === deviceId;
  const remote = !local.inJam && active && !thisIsActive ? active : null;
  const remoteDevice = remote ? (snapshot?.devices.find((d) => d.id === remote.deviceId) ?? null) : null;

  // ---- publishing this device's playback --------------------------------------

  const connected = snapshot !== null;
  useEffect(() => {
    if (!connected || local.inJam) return;
    // Only the playing device (or the active one, while paused) speaks for the account.
    if (!local.isPlaying && !thisIsActive && !claimNextPublishRef.current) return;
    const timer = window.setTimeout(() => {
      const p = localRef.current;
      const start = Math.max(0, Math.min(p.currentIndex - 100, p.queue.length - MAX_PUBLISHED_QUEUE));
      const state: RemotePlayback = {
        queue: p.queue.slice(start, start + MAX_PUBLISHED_QUEUE).map(toJamTrack),
        index: p.currentIndex - start,
        playing: p.isPlaying,
        position: p.progress,
        duration: p.duration || p.current?.duration || 0,
        volume: p.volume,
        shuffle: p.shuffle,
        repeat: p.repeat,
      };
      const claim = claimNextPublishRef.current;
      claimNextPublishRef.current = false;
      publishPlayback(deviceId, state, claim).catch(() => void 0);
    }, PUBLISH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // progress is read at publish time; position changes are covered by seekCount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    connected,
    thisIsActive,
    local.inJam,
    local.isPlaying,
    local.current?.id,
    local.currentIndex,
    local.queue,
    local.duration,
    local.volume,
    local.shuffle,
    local.repeat,
    local.seekCount,
  ]);

  // Only one device plays at a time: another one starting pauses this one.
  useEffect(() => {
    const p = localRef.current;
    if (remote?.state.playing && p.isPlaying && !p.inJam) p.togglePlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote?.deviceId, remote?.state.playing]);

  // ---- the player the app sees ------------------------------------------------

  // Re-render a playing remote's progress bar a few times a second.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!remote?.state.playing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [remote?.state.playing]);

  const send = useCallback(
    (command: ConnectCommand) => {
      if (remote) sendCommand(deviceId, remote.deviceId, command).catch(() => void 0);
    },
    [deviceId, remote],
  );

  const remotePlayer = useMemo<PlayerContextValue | null>(() => {
    if (!remote) return null;
    const { state } = remote;
    const queue = state.queue as Child[];
    const elapsed = state.playing ? (now + offsetRef.current - remote.positionAt) / 1000 : 0;
    const progress = Math.min(state.position + elapsed, state.duration || Infinity);
    const nextRepeat = REPEAT_ORDER[(REPEAT_ORDER.indexOf(state.repeat) + 1) % 3];
    return {
      ...local,
      queue,
      currentIndex: state.index,
      current: queue[state.index] ?? null,
      isPlaying: state.playing,
      progress,
      duration: state.duration,
      volume: state.volume,
      shuffle: state.shuffle,
      repeat: state.repeat,
      canControl: true,
      audioBlocked: false,
      resumeAudio: () => {},
      playQueue: (tracks, startIndex = 0) => send({ type: "playQueue", tracks: tracks.map(toJamTrack), startIndex }),
      enqueue: (tracks) => send({ type: "enqueue", tracks: tracks.map(toJamTrack) }),
      addNext: (tracks) => send({ type: "addNext", tracks: tracks.map(toJamTrack) }),
      jumpTo: (index) => send({ type: "jump", offset: index - state.index }),
      removeAt: (index) => send({ type: "remove", offset: index - state.index }),
      moveTrack: (from, to) => send({ type: "move", from: from - state.index, to: to - state.index }),
      togglePlay: () => send({ type: state.playing ? "pause" : "play" }),
      playNext: () => send({ type: "next" }),
      playPrevious: () => send({ type: "previous" }),
      seek: (position) => send({ type: "seek", position }),
      setVolume: (volume) => send({ type: "setVolume", volume }),
      toggleShuffle: () => send({ type: "setShuffle", value: !state.shuffle }),
      cycleRepeat: () => send({ type: "setRepeat", value: nextRepeat }),
    };
  }, [remote, now, local, send]);

  const transferTo = useCallback(
    (target: string) => {
      if (active && target !== active.deviceId) {
        sendCommand(deviceId, target, { type: "transfer" }).catch(() => void 0);
      }
    },
    [active, deviceId],
  );

  const renameDevice = useCallback((name: string) => {
    setDeviceName(name);
    setName(getDeviceName());
  }, []);

  const connectValue = useMemo<ConnectContextValue>(
    () => ({
      available,
      thisDevice,
      devices: snapshot?.devices ?? [],
      remoteDevice,
      transferTo,
      renameDevice,
    }),
    [available, thisDevice, snapshot?.devices, remoteDevice, transferTo, renameDevice],
  );

  return (
    <ConnectContext.Provider value={connectValue}>
      <PlayerContext.Provider value={remotePlayer ?? local}>{children}</PlayerContext.Provider>
    </ConnectContext.Provider>
  );
}

/** The player to show and control: this device's, or the account's playing device. */
export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider");
  return ctx;
}

export function useConnect(): ConnectContextValue {
  const ctx = useContext(ConnectContext);
  if (!ctx) throw new Error("useConnect must be used within a PlayerProvider");
  return ctx;
}
