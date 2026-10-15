import { NavLink } from "react-router-dom";
import { usePlaylists } from "@/lib/playlists";
import { HeartIcon, HomeIcon, JamIcon, LibraryIcon, MixIcon, PlusIcon, PodcastIcon, SearchIcon } from "./icons";
import { useJam } from "@/context/JamContext";
import { isWide, openOrCloseRightPanel, shownPanel, useRightPanel, WIDE_QUERY } from "@/lib/rightPanel";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { CreatePlaylistButton } from "./CreatePlaylistButton";
import { SmartPlaylistArt } from "./SmartPlaylistArt";
import { SMART_PLAYLISTS } from "@/lib/smartPlaylists";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-4 rounded-md px-3 py-2 font-semibold transition-colors ${
    isActive ? "text-white" : "text-spotify-gray hover:text-white"
  }`;

export function Sidebar() {
  const playlists = usePlaylists() ?? [];
  const { jamId } = useJam();
  // Wide screens open the Jam beside the page.
  const wide = useMediaQuery(WIDE_QUERY);
  const jamPanelOpen = shownPanel(useRightPanel(), jamId !== null) === "jam";

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
          <NavLink
            to="/jam"
            onClick={(e) => {
              if (isWide()) {
                e.preventDefault();
                openOrCloseRightPanel("jam", jamId !== null);
              }
            }}
            className={({ isActive }) => navLinkClass({ isActive: wide ? jamPanelOpen : isActive })}
          >
            <JamIcon className="h-6 w-6" />
            Jam
            {jamId && <span className="ml-auto h-2 w-2 rounded-full bg-spotify-green" aria-label="In a Jam" />}
          </NavLink>
          <NavLink to="/mixes" className={navLinkClass}>
            <MixIcon className="h-6 w-6" />
            Mixes
          </NavLink>
          <NavLink to="/podcasts" className={navLinkClass}>
            <PodcastIcon className="h-6 w-6" />
            Podcasts
          </NavLink>
        </nav>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-spotify-elevated-black">
        <div className="flex items-center justify-between px-4 pt-4">
          <NavLink to="/library" className="flex items-center gap-3 font-semibold text-spotify-gray hover:text-white">
            <LibraryIcon className="h-6 w-6 fill-current" />
            Your Library
          </NavLink>
          <CreatePlaylistButton>
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

          {SMART_PLAYLISTS.map((p) => (
            <NavLink
              key={p.id}
              to={`/smart/${p.id}`}
              title={p.description}
              className={({ isActive }) =>
                `flex flex-shrink-0 items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-white/10 hover:text-white ${
                  isActive ? "text-white" : "text-spotify-gray"
                }`
              }
            >
              <span className="h-8 w-8 flex-shrink-0">
                <SmartPlaylistArt playlist={p} />
              </span>
              <span className="truncate">{p.name}</span>
            </NavLink>
          ))}

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
