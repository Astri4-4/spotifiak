import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { NowPlayingBar } from "./NowPlayingBar";

export function Layout() {
  return (
    <div className="flex h-screen flex-col bg-black">
      <div className="flex min-h-0 flex-1 gap-2 p-2 pb-0">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto rounded-lg bg-gradient-to-b from-spotify-highlight-black to-spotify-base-black">
          <TopBar />
          <div className="px-6 pb-8">
            <Outlet />
          </div>
        </main>
      </div>
      <NowPlayingBar />
    </div>
  );
}
