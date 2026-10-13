import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LogoutIcon, SearchIcon } from "./icons";

export function TopBar() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    navigate(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : "/search");
  }

  return (
    // pt-safe-top keeps the search field clear of the phone's status bar/notch.
    <header className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-spotify-base-black/80 px-4 pb-3 pt-[calc(var(--safe-top)+0.75rem)] md:gap-4 md:px-6 backdrop-blur-md">
      <form onSubmit={handleSearchSubmit} className="min-w-0 flex-1 md:max-w-md">
        <div className="flex items-center gap-3 rounded-full bg-spotify-highlight-black px-4 py-2.5 focus-within:ring-2 focus-within:ring-white">
          <SearchIcon className="h-5 w-5 flex-shrink-0 text-spotify-gray" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="What do you want to listen to?"
            className="w-full min-w-0 bg-transparent text-base outline-none md:text-sm placeholder:text-spotify-gray"
          />
        </div>
      </form>

      <div className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-spotify-gray-subdued font-bold text-black"
        >
          {username?.[0]?.toUpperCase() ?? "?"}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-20 mt-2 w-48 rounded-md bg-spotify-highlight-black py-1 shadow-xl">
              <div className="truncate px-4 py-2 text-sm text-spotify-gray">{username}</div>
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-white/10"
              >
                <LogoutIcon className="h-4 w-4" />
                Log out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
