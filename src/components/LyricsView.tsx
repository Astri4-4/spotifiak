import { useEffect, useRef } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { useLyrics } from "@/lib/lyrics";
import type { Child } from "@/types/subsonic";

/** How long (ms) a manual scroll stops the view from following the song. */
const MANUAL_SCROLL_PAUSE = 4000;

/**
 * The current song's lyrics: in the cover's spot in the full-screen player,
 * scrolling on their own, or (`page`) as a desktop page that scrolls with
 * <main>. Synced lyrics follow the song and a click on a line seeks to it.
 */
export function LyricsView({ track, page = false }: { track: Child; page?: boolean }) {
  const { progress, seek, canControl } = usePlayer();
  const state = useLyrics(track, true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastManualScrollRef = useRef(0);

  const lyrics = state.status === "done" ? state.lyrics : null;
  let active = -1;
  if (lyrics?.synced) {
    for (let i = 0; i < lyrics.lines.length && lyrics.lines[i].start! <= progress; i++) active = i;
  }

  // What scrolls: this view, or the page around it.
  const scroller = () => (page ? scrollRef.current?.closest("main") : scrollRef.current) ?? null;

  // Keep the current line a little above the middle.
  useEffect(() => {
    const container = scroller();
    if (!container || Date.now() - lastManualScrollRef.current < MANUAL_SCROLL_PAUSE) return;
    const line = scrollRef.current?.querySelector<HTMLElement>(`[data-line="${Math.max(active, 0)}"]`);
    if (!line) return;
    const lineTop = line.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({
      top: lineTop - container.clientHeight * 0.35,
      behavior: active <= 0 ? "auto" : "smooth",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lyrics]);

  useEffect(() => {
    lastManualScrollRef.current = 0;
    scroller()?.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  if (state.status === "loading") {
    return (
      <p className={`flex flex-1 items-center justify-center text-sm text-white/60 ${page ? "py-24" : ""}`}>
        Loading lyrics…
      </p>
    );
  }
  if (!lyrics) {
    return (
      <div className={`flex flex-1 flex-col items-center justify-center text-center ${page ? "py-24" : ""}`}>
        <p className="text-lg font-bold">No lyrics for this song</p>
        <p className="mt-1 text-sm text-white/60">Add them to the file's tags or as a .lrc file next to it.</p>
      </div>
    );
  }

  const markManualScroll = () => {
    lastManualScrollRef.current = Date.now();
  };

  return (
    <div
      ref={scrollRef}
      onTouchMove={markManualScroll}
      onWheel={markManualScroll}
      className={
        page
          ? "pb-[40vh] pt-4"
          : "relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[30vh] pt-8 [mask-image:linear-gradient(transparent,black_12%,black_88%,transparent)]"
      }
    >
      {lyrics.lines.map((line, i) => {
        const text = line.text || "♪";
        const className = `block w-full text-left text-2xl font-bold leading-snug transition-colors md:text-3xl lg:text-4xl ${
          !lyrics.synced ? "text-white" : i === active ? "text-white" : i < active ? "text-white/60" : "text-white/35"
        }`;
        return lyrics.synced && canControl ? (
          <button
            key={i}
            type="button"
            data-line={i}
            onClick={() => {
              lastManualScrollRef.current = 0;
              seek(line.start!);
            }}
            className={`${className} py-1.5 hover:text-white`}
          >
            {text}
          </button>
        ) : (
          <p key={i} data-line={i} className={`${className} ${line.text ? "py-1.5" : "py-3"}`}>
            {lyrics.synced || line.text ? text : null}
          </p>
        );
      })}
      <p className="mt-8 text-xs text-white/50">
        {!lyrics.synced && "These lyrics aren't synced to the song. "}
        {lyrics.source === "lrclib" && (
          <>
            Lyrics from{" "}
            <a href="https://lrclib.net" target="_blank" rel="noreferrer" className="underline">
              LRCLIB
            </a>
          </>
        )}
      </p>
    </div>
  );
}
