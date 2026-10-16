import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JamQueueItem, JamState } from "@/api/jam";
import { createScreen, screenEnded, screenEventsUrl, screenLyrics, screenRestUrl, type ScreenKey } from "@/api/screens";
import { loadLyrics, type Lyrics } from "@/lib/lyrics";
import type { Child } from "@/types/subsonic";
import { MicIcon } from "@/components/icons";

// The TV of a karaoke Jam: /tv, opened in the TV's browser with no login.
// It shows a code that someone in the Jam enters on their phone; from then
// on it plays the Jam's songs (with the voice turned down) and shows the
// lyrics, while the phones are the remote.

const KEY_STORAGE = "spotifion.screen";
/** Further than this from the Jam's playhead (seconds), the TV jumps back in step. */
const SYNC_TOLERANCE = 1;
const DRIFT_CHECK_MS = 5_000;
/** Lyrics show this much ahead of the voice, to read them in time. */
const LYRICS_LEAD = 0.35;
/** Below this, the voice band is all that's lowered: bass and kick stay. */
const VOICE_LOW_CUT_HZ = 150;

function savedKey(): ScreenKey | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY_STORAGE) ?? "null");
    return parsed?.code && parsed?.secret ? parsed : null;
  } catch {
    return null;
  }
}

function saveKey(key: ScreenKey | null) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, JSON.stringify(key));
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Not kept: a reload shows a new code.
  }
}

type Link = { status: "starting" } | { status: "error"; message: string } | { status: "ready"; key: ScreenKey; jamId: string | null };

/** The screen's code, and the Jam it shows (kept live). */
function useScreen() {
  const [link, setLink] = useState<Link>({ status: "starting" });
  const [jam, setJam] = useState<JamState | null>(null);
  /** Server clock minus ours (ms). */
  const offsetRef = useRef(0);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    async function open() {
      let key = savedKey();
      if (!key) {
        try {
          key = await createScreen();
          saveKey(key);
        } catch (err) {
          if (!cancelled) setLink({ status: "error", message: (err as Error).message });
          return;
        }
      }
      if (cancelled) return;
      const k = key;
      setLink({ status: "ready", key: k, jamId: null });
      es = new EventSource(screenEventsUrl(k));
      es.addEventListener("screen", (e: MessageEvent<string>) => {
        const { jamId } = JSON.parse(e.data) as { jamId: string | null };
        setLink({ status: "ready", key: k, jamId });
        if (!jamId) setJam(null);
      });
      es.addEventListener("state", (e: MessageEvent<string>) => {
        const { state, now } = JSON.parse(e.data) as { state: JamState; now: number };
        offsetRef.current = now - Date.now();
        setJam(state);
      });
      es.addEventListener("ping", (e: MessageEvent<string>) => {
        offsetRef.current = (JSON.parse(e.data) as { now: number }).now - Date.now();
      });
      es.onerror = () => {
        // Closed for good: the server doesn't know this screen any more (it restarted). Start over.
        if (es?.readyState === EventSource.CLOSED) {
          saveKey(null);
          es.close();
          if (!cancelled) window.setTimeout(() => setAttempt((n) => n + 1), 1000);
        }
      };
    }

    void open();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [attempt]);

  return { link, jam, offsetRef };
}

/** Lowers the voice: what's in the middle of the stereo image, above the bass. */
function useVoiceControl(audio: HTMLAudioElement | null, unlocked: boolean, vocals: number) {
  const nodes = useRef<{ ctx: AudioContext; dry: GainNode; wet: GainNode; voice: GainNode } | null>(null);

  useEffect(() => {
    if (!audio || !unlocked || nodes.current) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const source = ctx.createMediaElementSource(audio);

    // Mono songs too: make two channels first.
    const stereo = ctx.createGain();
    stereo.channelCount = 2;
    stereo.channelCountMode = "explicit";
    stereo.channelInterpretation = "speakers";
    source.connect(stereo);

    const split = ctx.createChannelSplitter(2);
    stereo.connect(split);
    const gain = (value: number) => {
      const g = ctx.createGain();
      g.gain.value = value;
      return g;
    };
    // mid = (L + R) / 2, side = (L - R) / 2
    const mid = gain(1);
    const side = gain(1);
    const midL = gain(0.5);
    const midR = gain(0.5);
    const sideL = gain(0.5);
    const sideR = gain(-0.5);
    split.connect(midL, 0);
    split.connect(midR, 1);
    split.connect(sideL, 0);
    split.connect(sideR, 1);
    midL.connect(mid);
    midR.connect(mid);
    sideL.connect(side);
    sideR.connect(side);

    // The middle, with the voice band at `voice`: low = lowpass(mid) + voice * highpass(mid).
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = VOICE_LOW_CUT_HZ;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = VOICE_LOW_CUT_HZ;
    const voice = gain(vocals);
    const midOut = gain(1);
    mid.connect(low).connect(midOut);
    mid.connect(high).connect(voice).connect(midOut);

    // Back to stereo: L = mid + side, R = mid - side.
    const merge = ctx.createChannelMerger(2);
    const sideInverted = gain(-1);
    midOut.connect(merge, 0, 0);
    midOut.connect(merge, 0, 1);
    side.connect(merge, 0, 0);
    side.connect(sideInverted).connect(merge, 0, 1);

    const wet = gain(vocals >= 1 ? 0 : 1);
    const dry = gain(vocals >= 1 ? 1 : 0);
    merge.connect(wet).connect(ctx.destination);
    source.connect(dry).connect(ctx.destination);
    nodes.current = { ctx, dry, wet, voice };
    void ctx.resume();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio, unlocked]);

  useEffect(() => {
    const n = nodes.current;
    if (!n) return;
    const at = n.ctx.currentTime;
    // As recorded: the untouched sound (the filters color it a little).
    const original = vocals >= 0.99;
    n.dry.gain.setTargetAtTime(original ? 1 : 0, at, 0.05);
    n.wet.gain.setTargetAtTime(original ? 0 : 1, at, 0.05);
    n.voice.gain.setTargetAtTime(vocals, at, 0.05);
  }, [vocals, unlocked]);
}

function useLyricsFor(key: ScreenKey | null, item: JamQueueItem | null): Lyrics | null | undefined {
  const cache = useRef(new Map<string, Promise<Lyrics | null>>());
  const [state, setState] = useState<{ id: string; lyrics: Lyrics | null } | null>(null);
  const id = item?.track.id;

  useEffect(() => {
    if (!key || !item || !id) return;
    let promise = cache.current.get(id);
    if (!promise) {
      promise = loadLyrics(item.track as Child, () => screenLyrics(key, id)).catch(() => null);
      cache.current.set(id, promise);
    }
    let cancelled = false;
    void promise.then((lyrics) => !cancelled && setState({ id, lyrics }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key?.code, id]);

  if (!id) return null;
  return state?.id === id ? state.lyrics : undefined;
}

export function Screen() {
  const { link, jam, offsetRef } = useScreen();
  const key = link.status === "ready" ? link.key : null;
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const loadedUid = useRef<string | null>(null);
  const jamRef = useRef(jam);
  jamRef.current = jam;

  const item = jam && jam.currentIndex >= 0 ? (jam.queue[jam.currentIndex] ?? null) : null;
  const next = jam && item ? (jam.queue.slice(jam.currentIndex + 1).find((i) => !i.fallback) ?? jam.queue[jam.currentIndex + 1] ?? null) : null;
  const karaoke = jam?.karaoke ?? { on: true, vocals: 0.15 };
  const vocals = karaoke.on ? karaoke.vocals : 1;
  useVoiceControl(audio, unlocked, vocals);
  const lyrics = useLyricsFor(key, item);

  const expected = useCallback(() => {
    const j = jamRef.current;
    if (!j) return 0;
    if (!j.playing) return j.position;
    return j.position + (Date.now() + offsetRef.current - j.positionAt) / 1000;
  }, [offsetRef]);

  const seekIfFar = useCallback(() => {
    if (!audio || audio.seeking) return;
    const target = expected();
    if (Math.abs(audio.currentTime - target) > SYNC_TOLERANCE) audio.currentTime = target;
  }, [audio, expected]);

  // A new song: load it where the Jam is.
  useEffect(() => {
    if (!audio || !key) return;
    if (!item) {
      loadedUid.current = null;
      audio.pause();
      audio.removeAttribute("src");
      return;
    }
    if (loadedUid.current === item.uid) return;
    loadedUid.current = item.uid;
    audio.src = screenRestUrl(key, "stream", { id: item.track.id });
    audio.currentTime = expected();
    if (unlocked && jamRef.current?.playing) void audio.play().catch(() => void 0);
  }, [audio, key, item, unlocked, expected]);

  // Play, pause and seek with the Jam.
  useEffect(() => {
    if (!audio || !jam || !item || !unlocked) return;
    if (jam.playing) {
      seekIfFar();
      if (audio.paused) void audio.play().catch(() => void 0);
    } else {
      if (!audio.paused) audio.pause();
      if (Math.abs(audio.currentTime - jam.position) > 0.25) audio.currentTime = jam.position;
    }
  }, [audio, jam, item, unlocked, seekIfFar]);

  // Stay in step, and follow the playhead for the lyrics.
  useEffect(() => {
    if (!audio) return;
    const tick = window.setInterval(() => setTime(audio.currentTime), 100);
    const drift = window.setInterval(() => jamRef.current?.playing && seekIfFar(), DRIFT_CHECK_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(drift);
    };
  }, [audio, seekIfFar]);

  function start() {
    setUnlocked(true);
    // Fullscreen where the TV's browser allows it.
    void document.documentElement.requestFullscreen?.().catch(() => void 0);
    if (audio && jamRef.current?.playing && audio.src) void audio.play().catch(() => void 0);
  }

  const cover = item?.track.coverArt && key ? screenRestUrl(key, "getCoverArt", { id: item.track.coverArt, size: 600 }) : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white [cursor:none]">
      <audio
        ref={setAudio}
        crossOrigin="anonymous"
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          if (jamRef.current) e.currentTarget.currentTime = expected();
        }}
        onEnded={() => key && item && void screenEnded(key, item.uid).catch(() => void 0)}
      />
      {cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-3xl" />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/80" />

      <div className="relative flex h-full flex-col p-[4vh]">
        {link.status === "starting" ? (
          <Centered>Starting…</Centered>
        ) : link.status === "error" ? (
          <Centered>{link.message}</Centered>
        ) : !link.jamId ? (
          <Pairing code={link.key.code} />
        ) : !jam ? (
          <Centered>Connecting to the Jam…</Centered>
        ) : (
          <>
            <Header item={item} cover={cover} jamId={jam.id} voice={karaoke.on ? vocals : null} />
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {!item ? (
                <div className="text-center">
                  <MicIcon className="mx-auto mb-[3vh] h-[12vh] w-[12vh] text-spotify-green" />
                  <p className="text-[5vh] font-bold">Pick a song on your phone</p>
                  <p className="mt-[1vh] text-[3vh] text-white/60">Search, then "Add to Jam queue".</p>
                </div>
              ) : (
                <LyricsView lyrics={lyrics} time={time + LYRICS_LEAD} duration={duration || item.track.duration || 0} title={item.track.title} />
              )}
            </div>
            <Footer time={time} duration={duration || item?.track.duration || 0} next={next} />
          </>
        )}
      </div>

      {link.status === "ready" && !unlocked && (
        <button
          type="button"
          autoFocus
          onClick={start}
          className="absolute inset-0 flex flex-col items-center justify-center gap-[2vh] bg-black/80 text-center [cursor:auto] focus:outline-none"
        >
          <span className="rounded-full bg-spotify-green px-[5vh] py-[2vh] text-[4vh] font-bold text-on-accent">Start</span>
          <span className="text-[2.5vh] text-white/60">Press OK on the remote (the TV needs it to play sound)</span>
        </button>
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center text-center text-[4vh] text-white/80">{children}</div>;
}

function Pairing({ code }: { code: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <MicIcon className="mb-[3vh] h-[10vh] w-[10vh] text-spotify-green" />
      <p className="text-[4vh] font-bold">Karaoke on this TV</p>
      <p className="mb-[4vh] mt-[1vh] max-w-[70vw] text-[2.6vh] text-white/70">
        On your phone, start or join a Jam in Spotifiak. Under Karaoke, "Connect a TV", enter:
      </p>
      <p className="font-mono text-[14vh] font-bold leading-none tracking-[0.3em]">{code}</p>
    </div>
  );
}

function Header({ item, cover, jamId, voice }: { item: JamQueueItem | null; cover: string | null; jamId: string; voice: number | null }) {
  return (
    <div className="flex items-start justify-between gap-[3vh]">
      <div className="flex min-w-0 items-center gap-[2vh]">
        {item && cover && <img src={cover} alt="" className="h-[11vh] w-[11vh] flex-shrink-0 rounded-lg object-cover shadow-2xl" />}
        {item && (
          <div className="min-w-0">
            <p className="truncate text-[4vh] font-bold leading-tight">{item.track.title}</p>
            <p className="truncate text-[2.8vh] text-white/70">{item.track.artist}</p>
            <p className="mt-[0.5vh] flex items-center gap-[1vh] text-[2.4vh] text-spotify-green">
              <MicIcon className="h-[2.6vh] w-[2.6vh]" />
              {item.addedBy}
            </p>
          </div>
        )}
      </div>
      <div className="flex-shrink-0 text-right text-[2.2vh] text-white/60">
        <p>
          Join the Jam: <span className="font-mono font-bold tracking-widest text-white">{jamId}</span>
        </p>
        {voice !== null && <p>Voice {voice < 0.02 ? "off" : `${Math.round(voice * 100)}%`}</p>}
      </div>
    </div>
  );
}

function LyricsView({ lyrics, time, duration, title }: { lyrics: Lyrics | null | undefined; time: number; duration: number; title: string }) {
  const current = useMemo(() => {
    if (!lyrics?.synced) return -1;
    let index = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if ((lyrics.lines[i].start ?? 0) <= time) index = i;
      else break;
    }
    return index;
  }, [lyrics, time]);

  if (lyrics === undefined) return <p className="text-[3vh] text-white/50">Finding the lyrics…</p>;
  if (!lyrics || !lyrics.lines.some((l) => l.text.trim())) {
    return (
      <div className="text-center">
        <p className="text-[5vh] font-bold">{title}</p>
        <p className="mt-[1vh] text-[3vh] text-white/60">No lyrics for this one: you know the words!</p>
      </div>
    );
  }

  if (!lyrics.synced) {
    // Not timed: scroll through them as the song goes.
    const progress = duration ? Math.min(1, time / duration) : 0;
    return (
      <div className="relative h-full w-full overflow-hidden">
        <div
          className="absolute inset-x-0 text-center text-[4.2vh] font-bold leading-snug transition-transform duration-1000 ease-linear"
          style={{ transform: `translateY(calc(30vh - ${progress * 100}%))` }}
        >
          {lyrics.lines.map((l, i) => (
            <p key={i} className="min-h-[1em]">
              {l.text}
            </p>
          ))}
        </div>
      </div>
    );
  }

  // Timed: the line to sing now, big; the ones around it smaller.
  const shown = [-2, -1, 0, 1, 2].map((d) => ({ d, index: current + d }));
  return (
    <div className="flex w-full flex-col items-center gap-[2.5vh] text-center">
      {shown.map(({ d, index }) => {
        const line = index >= 0 ? lyrics.lines[index] : null;
        const text = line?.text.trim() || (d === 0 && line ? "♪" : "");
        return (
          <p
            key={d}
            className={`max-w-[90vw] font-bold leading-tight transition-all duration-300 ${
              d === 0 ? "text-[7.5vh] text-white" : Math.abs(d) === 1 ? "text-[4.5vh] text-white/50" : "text-[3.5vh] text-white/25"
            }`}
          >
            {text || " "}
          </p>
        );
      })}
    </div>
  );
}

function Footer({ time, duration, next }: { time: number; duration: number; next: JamQueueItem | null }) {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return (
    <div>
      {duration > 0 && (
        <div className="mb-[2vh] flex items-center gap-[2vh] text-[2.2vh] tabular-nums text-white/60">
          <span>{fmt(time)}</span>
          <div className="h-[0.8vh] flex-1 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-spotify-green" style={{ width: `${Math.min(100, (time / duration) * 100)}%` }} />
          </div>
          <span>{fmt(duration)}</span>
        </div>
      )}
      <p className="truncate text-[2.6vh] text-white/70">
        {next ? (
          <>
            Next: <span className="font-semibold text-white">{next.track.title}</span> · {next.track.artist} ·{" "}
            <span className="text-spotify-green">{next.addedBy}</span>
          </>
        ) : (
          "Nothing next: add a song from your phone."
        )}
      </p>
    </div>
  );
}
