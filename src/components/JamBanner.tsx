import { useLocation } from "react-router-dom";
import { usePlayer } from "@/context/PlayerContext";
import { useJam } from "@/context/JamContext";
import { CloseIcon, JamIcon } from "./icons";

/**
 * Jam messages shown on every page: the "tap to listen" prompt browsers
 * require after a reload mid-Jam, and errors / "Jam ended" notices (the Jam
 * page shows those itself).
 */
export function JamBanner() {
  const { audioBlocked, resumeAudio, inJam } = usePlayer();
  const { notice, clearNotice } = useJam();
  const { pathname } = useLocation();

  if (inJam && audioBlocked) {
    return (
      <button
        type="button"
        onClick={resumeAudio}
        className="mx-2 mt-1 flex flex-shrink-0 items-center justify-center gap-2 rounded-md bg-spotify-green px-4 py-2 text-sm font-bold text-black md:mx-0 md:mt-0 md:rounded-none"
      >
        <JamIcon className="h-4 w-4" />
        Tap to start listening to the Jam
      </button>
    );
  }

  if (notice && pathname !== "/jam") {
    return (
      <div className="mx-2 mt-1 flex flex-shrink-0 items-center justify-between gap-3 rounded-md bg-spotify-highlight-black px-4 py-2 text-sm md:mx-0 md:mt-0 md:rounded-none">
        <span className="flex min-w-0 items-center gap-2">
          <JamIcon className="h-4 w-4 flex-shrink-0 text-spotify-green" />
          <span className="truncate">{notice}</span>
        </span>
        <button type="button" onClick={clearNotice} aria-label="Dismiss" className="text-spotify-gray hover:text-white">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return null;
}
