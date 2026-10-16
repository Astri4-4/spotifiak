import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { JamAction, JamState } from "@/api/jam";
import { jamInviteOrigin } from "@/lib/servers";
import { LyricsIcon, MicIcon, TvIcon } from "./icons";

/** How often moving the voice slider is sent (the TV follows it live). */
const VOCALS_SEND_MS = 250;

/**
 * Karaoke for a Jam: a TV shows the lyrics and plays the songs with the voice
 * turned down, and everyone's phone is the remote.
 */
export function KaraokeCard({
  jam,
  canControl,
  act,
}: {
  jam: JamState;
  canControl: boolean;
  act: (action: JamAction) => Promise<boolean>;
}) {
  const karaoke = jam.karaoke ?? { on: false, vocals: 0.15 };
  const screens = jam.screens ?? [];
  const [origin, setOrigin] = useState("");
  const [code, setCode] = useState("");
  const [connecting, setConnecting] = useState(false);
  // The slider moves at once; the Jam hears about it a few times a second.
  const [vocals, setVocals] = useState<number | null>(null);
  const pending = useRef<number | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    void jamInviteOrigin().then(setOrigin);
    return () => window.clearTimeout(timer.current);
  }, []);

  function moveVocals(value: number) {
    setVocals(value);
    pending.current = value;
    if (timer.current !== undefined) return;
    timer.current = window.setTimeout(function flush() {
      timer.current = undefined;
      if (pending.current === null) return;
      const next = pending.current;
      pending.current = null;
      void act({ type: "setKaraoke", vocals: next });
    }, VOCALS_SEND_MS);
  }

  async function connect(e: FormEvent) {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setConnecting(true);
    if (await act({ type: "connectScreen", code: trimmed })) setCode("");
    setConnecting(false);
  }

  const shownVocals = vocals ?? karaoke.vocals;
  // Back to the Jam's value once it has caught up.
  useEffect(() => {
    if (vocals !== null && pending.current === null && timer.current === undefined && Math.abs(karaoke.vocals - vocals) < 0.001) {
      setVocals(null);
    }
  }, [karaoke.vocals, vocals]);

  return (
    <section className="rounded-lg bg-white/5 p-4 sm:p-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-bold">
          <MicIcon className="h-5 w-5" />
          Karaoke
        </h2>
        {canControl && (
          <button
            type="button"
            role="switch"
            aria-checked={karaoke.on}
            aria-label="Karaoke"
            onClick={() => void act({ type: "setKaraoke", on: !karaoke.on })}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${karaoke.on ? "bg-spotify-green" : "bg-spotify-gray-subdued"}`}
          >
            <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${karaoke.on ? "left-6" : "left-1"}`} />
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-spotify-gray">
        {karaoke.on
          ? "The TV plays the songs with the voice turned down and shows the lyrics. Phones stay silent: they're the remote."
          : "Put the lyrics on a TV, turn the voice down, and sing. Everyone's phone is the remote."}
      </p>

      {karaoke.on && (
        <label className="mb-5 block">
          <span className="mb-1 flex justify-between text-sm font-semibold">
            Voice
            <span className="font-normal text-spotify-gray">{shownVocals < 0.02 ? "Off" : `${Math.round(shownVocals * 100)}%`}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={shownVocals}
            disabled={!canControl}
            onChange={(e) => moveVocals(Number(e.target.value))}
            className="w-full accent-spotify-green"
          />
          <span className="flex justify-between text-xs text-spotify-gray">
            <span>Just the music</span>
            <span>As recorded</span>
          </span>
        </label>
      )}

      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <TvIcon className="h-4 w-4" />
        {screens.length ? `On ${screens.length === 1 ? "a TV" : `${screens.length} TVs`}` : "Connect a TV"}
      </h3>
      {screens.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1">
          {screens.map((s) => (
            <li key={s} className="flex items-center justify-between gap-2 rounded-md bg-white/5 px-3 py-1.5 text-sm">
              <span className="font-mono tracking-widest">{s}</span>
              {canControl && (
                <button
                  type="button"
                  onClick={() => void act({ type: "disconnectScreen", code: s })}
                  className="text-xs font-bold text-spotify-gray hover:text-white"
                >
                  Disconnect
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canControl ? (
        <>
          <p className="mb-2 text-sm text-spotify-gray">
            On the TV, open <span className="break-all font-semibold text-white">{origin ? `${origin}/tv` : "/tv"}</span> in its browser, then
            enter the code it shows.
          </p>
          <form onSubmit={connect} className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="TV code"
              aria-label="TV code"
              className="min-w-0 flex-1 rounded-full bg-black/40 px-4 py-2 font-mono text-base uppercase tracking-widest outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-spotify-gray md:text-sm"
            />
            <button
              type="submit"
              disabled={connecting || code.trim().length < 6}
              className="rounded-full bg-white px-5 py-2 text-sm font-bold text-black hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
            >
              {connecting ? "Connecting…" : "Connect"}
            </button>
          </form>
        </>
      ) : (
        !screens.length && <p className="text-sm text-spotify-gray">The host can put this Jam on a TV.</p>
      )}

      {karaoke.on && (
        <Link to="/lyrics" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-spotify-gray hover:text-white">
          <LyricsIcon className="h-4 w-4" />
          Lyrics on this phone
        </Link>
      )}
    </section>
  );
}
