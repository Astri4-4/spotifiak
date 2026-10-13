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
import {
  createJam,
  getJam,
  jamEventsUrl,
  jamIsCrossOrigin,
  sendJamAction,
  type JamAction,
  type JamSnapshot,
  type JamState,
} from "@/api/jam";

const SESSION_KEY = "spotifion.jam.session";
const CLIENT_KEY = "spotifion.jam.client";
/** Refused event streams in a row before telling the user rather than just retrying. */
const MAX_SILENT_FAILURES = 3;

type JamStatus = "idle" | "connecting" | "live" | "reconnecting";

interface JamContextValue {
  /** Code of the Jam this tab is in, or null. Set before the first state arrives. */
  jamId: string | null;
  /** Latest shared state, or null while connecting / when not in a Jam. */
  jam: JamState | null;
  status: JamStatus;
  isHost: boolean;
  /** Whether this user may control playback (host, or guests when allowed). */
  canControl: boolean;
  /** Last error or "Jam ended" message, for display. */
  notice: string | null;
  clearNotice: () => void;
  startJam: () => Promise<void>;
  joinJam: (id: string) => void;
  leaveJam: () => void;
  endJam: () => Promise<void>;
  /** Sends an action to the Jam server. Resolves false (and sets `notice`) on failure. */
  act: (action: JamAction) => Promise<boolean>;
  /** Where the shared playhead is right now, in seconds. */
  expectedPosition: () => number;
}

const JamContext = createContext<JamContextValue | undefined>(undefined);

function randomId(): string {
  // crypto.randomUUID only exists in secure contexts; the app may be opened
  // over plain http on a LAN (e.g. `vite --host` from a phone).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode etc.) - the Jam just won't survive a reload.
  }
}

/** Stable per-tab id, so the server can tell two devices of the same user apart. */
function getClientId(): string {
  let id = readStorage(CLIENT_KEY);
  if (!id) {
    id = randomId();
    writeStorage(CLIENT_KEY, id);
  }
  return id;
}

export function JamProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, username } = useAuth();
  const [clientId] = useState(getClientId);
  const [jamId, setJamId] = useState<string | null>(() => readStorage(SESSION_KEY));
  const [jam, setJam] = useState<JamState | null>(null);
  const [status, setStatus] = useState<JamStatus>(jamId ? "connecting" : "idle");
  const [notice, setNotice] = useState<string | null>(null);

  // Server clock minus local clock, so every device agrees on "now".
  const offsetRef = useRef(0);
  const jamRef = useRef<JamState | null>(null);
  jamRef.current = jam;

  const finish = useCallback((message: string | null) => {
    writeStorage(SESSION_KEY, null);
    setJamId(null);
    setJam(null);
    setStatus("idle");
    setNotice(message);
  }, []);

  // Logging out leaves the Jam.
  useEffect(() => {
    if (!isLoading && !isAuthenticated && jamId) finish(null);
  }, [isLoading, isAuthenticated, jamId, finish]);

  useEffect(() => {
    if (!jamId || !isAuthenticated) return;
    let es: EventSource | null = null;
    let retryTimer: number | undefined;
    let disposed = false;
    // Streams that failed in a row; reset by any state update.
    let failures = 0;
    let warned = false;

    const onSnapshot = (e: MessageEvent<string>) => {
      const snap = JSON.parse(e.data) as JamSnapshot;
      offsetRef.current = snap.now - Date.now();
      failures = 0;
      setJam(snap.state);
      setStatus("live");
    };

    const connect = () => {
      es = new EventSource(jamEventsUrl(jamId, clientId));
      es.addEventListener("state", onSnapshot);
      es.addEventListener("ping", (e: MessageEvent<string>) => {
        offsetRef.current = (JSON.parse(e.data) as { now: number }).now - Date.now();
      });
      es.addEventListener("ended", () => finish("The host ended the Jam."));
      es.onerror = () => {
        if (disposed) return;
        setStatus("reconnecting");
        // EventSource retries dropped connections itself, but gives up for
        // good on an error response - e.g. because the Jam no longer exists.
        if (es?.readyState !== EventSource.CLOSED) return;
        es.close();
        failures++;
        getJam(jamId)
          .then((snap) => {
            if (disposed) return;
            if (!snap) {
              finish("This Jam has ended.");
              return;
            }
            // The Jam exists but its event stream keeps being refused: say
            // why instead of silently reconnecting forever.
            if (failures >= MAX_SILENT_FAILURES && !warned) {
              warned = true;
              setNotice(
                jamIsCrossOrigin()
                  ? "Can't get live updates from the Jam server. It's probably too old for the mobile app: update it to the latest Docker image."
                  : "Can't get live updates from the Jam server. Retrying...",
              );
            }
            retryTimer = window.setTimeout(connect, 3000);
          })
          .catch(() => {
            if (!disposed) retryTimer = window.setTimeout(connect, 5000);
          });
      };
    };

    connect();
    return () => {
      disposed = true;
      es?.close();
      window.clearTimeout(retryTimer);
    };
  }, [jamId, isAuthenticated, clientId, finish]);

  const joinJam = useCallback((id: string) => {
    writeStorage(SESSION_KEY, id);
    setJam(null);
    setNotice(null);
    setStatus("connecting");
    setJamId(id);
  }, []);

  const startJam = useCallback(async () => {
    try {
      joinJam(await createJam());
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't start a Jam.");
      throw err;
    }
  }, [joinJam]);

  const act = useCallback(
    async (action: JamAction) => {
      if (!jamId) return false;
      try {
        await sendJamAction(jamId, action);
        return true;
      } catch (err) {
        // "ended" reports race between listeners; failures there are expected noise.
        if (action.type !== "ended") setNotice(err instanceof Error ? err.message : "Jam request failed.");
        return false;
      }
    },
    [jamId],
  );

  const leaveJam = useCallback(() => finish(null), [finish]);

  const endJam = useCallback(async () => {
    if (await act({ type: "end" })) finish(null);
  }, [act, finish]);

  const expectedPosition = useCallback(() => {
    const s = jamRef.current;
    if (!s) return 0;
    if (!s.playing) return s.position;
    return s.position + (Date.now() + offsetRef.current - s.positionAt) / 1000;
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  const isHost = jam !== null && jam.host === username;
  const canControl = isHost || Boolean(jam?.guestsCanControl);

  const value = useMemo<JamContextValue>(
    () => ({
      jamId,
      jam,
      status,
      isHost,
      canControl,
      notice,
      clearNotice,
      startJam,
      joinJam,
      leaveJam,
      endJam,
      act,
      expectedPosition,
    }),
    [jamId, jam, status, isHost, canControl, notice, clearNotice, startJam, joinJam, leaveJam, endJam, act, expectedPosition],
  );

  return <JamContext.Provider value={value}>{children}</JamContext.Provider>;
}

export function useJam(): JamContextValue {
  const ctx = useContext(JamContext);
  if (!ctx) throw new Error("useJam must be used within a JamProvider");
  return ctx;
}
