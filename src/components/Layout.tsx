import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { NowPlayingBar } from "./NowPlayingBar";
import { BottomNav } from "./BottomNav";
import { JamBanner } from "./JamBanner";
import { NowPlayingSheet } from "./NowPlayingSheet";

export function Layout() {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

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
      </div>
      <JamBanner />
      <NowPlayingBar />
      <BottomNav />
      <NowPlayingSheet />
    </div>
  );
}
