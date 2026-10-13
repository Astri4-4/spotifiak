import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePlayer } from "@/context/PlayerContext";
import { useTrackStar } from "@/lib/trackStar";
import { setShortcutsOpen, useShortcutsOpen } from "@/lib/shortcutsDialog";
import { CloseIcon } from "./icons";

const SEEK_STEP = 5; // seconds
const VOLUME_STEP = 0.1;

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

const SHORTCUTS: [keys: string[], action: string][] = [
  [["Space"], "Play / pause"],
  [[MOD, "→"], "Next song"],
  [[MOD, "←"], "Previous song"],
  [["→"], `Forward ${SEEK_STEP} seconds`],
  [["←"], `Back ${SEEK_STEP} seconds`],
  [[MOD, "↑"], "Volume up"],
  [[MOD, "↓"], "Volume down"],
  [["M"], "Mute / unmute"],
  [["S"], "Shuffle"],
  [["R"], "Repeat"],
  [["L"], "Like the current song"],
  [["Q"], "Queue"],
  [["/"], "Search"],
  [["?"], "Show these shortcuts"],
];

/** Typing in a field (or using a slider's own arrow keys) must not trigger shortcuts. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Desktop keyboard shortcuts, like Spotify's, and the list of them ("?"). */
export function KeyboardShortcuts() {
  const player = usePlayer();
  const { toggle: toggleStar } = useTrackStar(player.current);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const open = useShortcutsOpen();
  const volumeBeforeMuteRef = useRef(0.8);

  // The listener is added once and reads the latest state from here.
  const latestRef = useRef({ player, toggleStar, navigate, pathname, open });
  latestRef.current = { player, toggleStar, navigate, pathname, open };

  useEffect(() => {
    let handledSpace = false;

    function onKeyDown(e: KeyboardEvent) {
      const { player: p, toggleStar: star, navigate: go, pathname: path, open: isOpen } = latestRef.current;
      if (isOpen) {
        if (e.key === "Escape") setShortcutsOpen(false);
        return;
      }
      if (e.defaultPrevented || e.altKey || isEditable(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const total = p.duration || p.current?.duration || 0;

      let handled = true;
      if (e.key === " " && !mod) {
        // Also when a button has focus, which would otherwise be "clicked" too.
        handledSpace = true;
        if (p.canControl || p.audioBlocked) p.togglePlay();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const forward = e.key === "ArrowRight";
        if (p.canControl && p.current) {
          if (mod) (forward ? p.playNext : p.playPrevious)();
          else p.seek(Math.min(Math.max(0, p.progress + (forward ? SEEK_STEP : -SEEK_STEP)), total || Infinity));
        }
      } else if (mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        p.setVolume(p.volume + (e.key === "ArrowUp" ? VOLUME_STEP : -VOLUME_STEP));
      } else if (e.key === "k" && mod) {
        focusSearch();
      } else if (mod) {
        // Leave the browser's and the system's own shortcuts (⌘R, ⌘L, ⌘Q...) alone.
        handled = false;
      } else {
        switch (e.key.toLowerCase()) {
          case "m":
            if (p.volume > 0) {
              volumeBeforeMuteRef.current = p.volume;
              p.setVolume(0);
            } else {
              p.setVolume(volumeBeforeMuteRef.current || 0.8);
            }
            break;
          case "s":
            p.toggleShuffle();
            break;
          case "r":
            p.cycleRepeat();
            break;
          case "l":
            void star();
            break;
          case "q":
            if (path === "/queue") go(-1);
            else go(p.inJam ? "/jam" : "/queue");
            break;
          case "/":
            focusSearch();
            break;
          case "?":
            setShortcutsOpen(true);
            break;
          default:
            handled = false;
        }
      }
      if (handled) e.preventDefault();
    }

    function onKeyUp(e: KeyboardEvent) {
      // A focused button is "clicked" on Space's keyup: stop that too.
      if (e.key === " " && handledSpace) {
        handledSpace = false;
        e.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => setShortcutsOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-lg bg-spotify-highlight-black p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={() => setShortcutsOpen(false)}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-spotify-gray hover:bg-white/10 hover:text-white"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex flex-col gap-2 text-sm">
          {SHORTCUTS.map(([keys, action]) => (
            <li key={action} className="flex items-center justify-between gap-4">
              <span className="text-spotify-gray">{action}</span>
              <span className="flex flex-shrink-0 gap-1">
                {keys.map((key) => (
                  <kbd key={key} className="min-w-[1.75rem] rounded bg-white/10 px-2 py-0.5 text-center font-sans text-xs font-semibold">
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function focusSearch() {
  const input = document.querySelector<HTMLInputElement>("input[data-search-input]");
  input?.focus();
  input?.select();
}
