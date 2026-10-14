import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { NowPlayingBar } from "./NowPlayingBar";
import { BottomNav } from "./BottomNav";
import { JamBanner } from "./JamBanner";
import { NowPlayingSheet } from "./NowPlayingSheet";
import { FriendActivity } from "./FriendActivity";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { SongMenu } from "./SongMenu";
import { CloseIcon } from "./icons";
import { Queue } from "@/pages/Queue";
import { Jam } from "@/pages/Jam";
import { usePlayer } from "@/context/PlayerContext";
import { openOrCloseRightPanel, setRightPanel, shownPanel, useRightPanel, WIDE_QUERY } from "@/lib/rightPanel";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useInvitePolling } from "@/lib/invites";
import { useAuth } from "@/context/AuthContext";

const PANEL_TITLES = { friends: "Friend activity", queue: "Queue", jam: "Jam" };

export function Layout() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { inJam } = usePlayer();
  const panel = shownPanel(useRightPanel(), inJam);
  const wide = useMediaQuery(WIDE_QUERY);
  useInvitePolling(useAuth().username);

  // The page scrolls inside <main>, not the window, so reset it on navigation.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // Wide screens show the queue and Jam beside the page, not as pages: their
  // URLs (a bookmark, or after joining from an invite) open the panel instead.
  useEffect(() => {
    if (!wide || (pathname !== "/queue" && pathname !== "/jam")) return;
    setRightPanel(pathname === "/jam" ? "jam" : "queue");
    navigate("/", { replace: true });
  }, [pathname, wide, navigate]);

  return (
    // 100dvh tracks the *visible* viewport on mobile browsers (address bar
    // showing/hiding), so the player and tab bar never end up off-screen.
    <div className="flex h-screen h-[100dvh] flex-col overflow-hidden bg-black">
      <div className="flex min-h-0 flex-1 md:gap-2 md:p-2 md:pb-0">
        <Sidebar />
        <main
          ref={mainRef}
          className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-spotify-highlight-black to-spotify-base-black md:rounded-lg"
        >
          <TopBar />
          <div className="px-4 pb-8 md:px-6">
            <Outlet />
          </div>
        </main>
        {/* Like Spotify's right-hand panel: Friend activity, the queue or the Jam; pages on narrower screens. */}
        {panel && !(panel === "friends" && pathname === "/activity") && (
          <aside
            className={`hidden w-80 flex-shrink-0 flex-col overflow-y-auto rounded-lg bg-spotify-base-black p-3 ${
              panel === "friends" ? "xl:flex" : "lg:flex"
            }`}
          >
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <h2 className="font-bold">{PANEL_TITLES[panel]}</h2>
              <button
                type="button"
                onClick={() => (panel === "friends" ? setRightPanel(null) : openOrCloseRightPanel(panel, inJam))}
                aria-label={`Hide ${PANEL_TITLES[panel]}`}
                className="flex h-8 w-8 items-center justify-center rounded-full text-spotify-gray hover:bg-white/10 hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            {panel === "friends" ? (
              <FriendActivity />
            ) : (
              <div className="px-2 pb-2">{panel === "queue" ? <Queue panel /> : <Jam panel />}</div>
            )}
          </aside>
        )}
      </div>
      <JamBanner />
      <NowPlayingBar />
      <BottomNav />
      <NowPlayingSheet />
      <KeyboardShortcuts />
      <SongMenu />
    </div>
  );
}
