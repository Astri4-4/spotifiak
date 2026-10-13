import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
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
import { setFriendsPanelOpen, useFriendsPanelOpen } from "@/lib/friendsPanel";

export function Layout() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const friendsPanelOpen = useFriendsPanelOpen();

  // The page scrolls inside <main>, not the window, so reset it on navigation.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

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
        {/* Friend activity, like Spotify's right-hand panel; a page on narrower screens. */}
        {friendsPanelOpen && pathname !== "/activity" && (
          <aside className="hidden w-80 flex-shrink-0 flex-col overflow-y-auto rounded-lg bg-spotify-base-black p-3 xl:flex">
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <h2 className="font-bold">Friend activity</h2>
              <button
                type="button"
                onClick={() => setFriendsPanelOpen(false)}
                aria-label="Hide Friend activity"
                className="flex h-8 w-8 items-center justify-center rounded-full text-spotify-gray hover:bg-white/10 hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <FriendActivity />
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
