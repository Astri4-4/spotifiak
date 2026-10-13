import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { getPlaylists } from "@/api/subsonic";
import type { Playlist } from "@/types/subsonic";
import { HeartIcon, HomeIcon, JamIcon, LibraryIcon, PlusIcon, SearchIcon } from "./icons";
import { useJam } from "@/context/JamContext";
import { CreatePlaylistButton } from "./CreatePlaylistButton";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-4 rounded-md px-3 py-2 font-semibold transition-colors ${
    isActive ? "text-white" : "text-spotify-gray hover:text-white"
  }`;

export function Sidebar() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const { jamId } = useJam();

  const refresh = () => {
    getPlaylists().then(setPlaylists).catch(() => void 0);
  };

  useEffect(refresh, []);

  return (
    <aside className="hidden h-full w-56 flex-shrink-0 flex-col gap-2 md:flex lg:w-64 xl:w-72">
      <div className="rounded-lg bg-spotify-elevated-black p-4">
        <nav className="flex flex-col gap-1">
          <NavLink to="/" end className={navLinkClass}>
            <HomeIcon className="h-6 w-6 fill-current" />
            Home
          </NavLink>
          <NavLink to="/search" className={navLinkClass}>
            <SearchIcon className="h-6 w-6" />
            Search
          </NavLink>
          <NavLink to="/jam" className={navLinkClass}>
            <JamIcon className="h-6 w-6" />
            Jam
            {jamId && <span className="ml-auto h-2 w-2 rounded-full bg-spotify-green" aria-label="In a Jam" />}
          </NavLink>
        </nav>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-spotify-elevated-black">
        <div className="flex items-center justify-between px-4 pt-4">
          <NavLink to="/library" className="flex items-center gap-3 font-semibold text-spotify-gray hover:text-white">
            <LibraryIcon className="h-6 w-6 fill-current" />
            Your Library
          </NavLink>
          <CreatePlaylistButton onCreated={refresh}>
            <span className="rounded-full p-1.5 text-spotify-gray hover:bg-white/10 hover:text-white">
              <PlusIcon className="h-5 w-5" />
            </span>
          </CreatePlaylistButton>
        </div>

        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-4">
          <NavLink
            to="/liked"
            className="flex flex-shrink-0 items-center gap-3 rounded-md px-2 py-2 text-sm text-spotify-gray hover:bg-white/10 hover:text-white"
          >
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-gradient-to-br from-indigo-600 to-blue-300">
              <HeartIcon filled className="h-5 w-5 text-pure-white" />
            </span>
            Liked Songs
          </NavLink>

          {playlists.map((playlist) => (
            <NavLink
              key={playlist.id}
              to={`/playlist/${playlist.id}`}
              title={playlist.name}
              className={({ isActive }) =>
                `flex-shrink-0 truncate rounded-md px-2 py-2 text-sm hover:bg-white/10 hover:text-white ${
                  isActive ? "text-white" : "text-spotify-gray"
                }`
              }
            >
              {playlist.name}
            </NavLink>
          ))}
        </div>
      </div>
    </aside>
  );
}
