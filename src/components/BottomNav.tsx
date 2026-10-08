import { NavLink } from "react-router-dom";
import { HomeIcon, LibraryIcon, SearchIcon } from "./icons";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors ${
    isActive ? "text-white" : "text-spotify-gray"
  }`;

/** Mobile-only tab bar, replacing the sidebar below the md breakpoint. */
export function BottomNav() {
  return (
    <nav className="flex flex-shrink-0 bg-black/95 pb-[env(safe-area-inset-bottom)] md:hidden">
      <NavLink to="/" end className={linkClass}>
        <HomeIcon className="h-6 w-6 fill-current" />
        Home
      </NavLink>
      <NavLink to="/search" className={linkClass}>
        <SearchIcon className="h-6 w-6" />
        Search
      </NavLink>
      <NavLink to="/library" className={linkClass}>
        <LibraryIcon className="h-6 w-6 fill-current" />
        Your Library
      </NavLink>
    </nav>
  );
}
