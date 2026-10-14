import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { FriendsIcon, SearchIcon } from "./icons";
import { Avatar } from "./Avatar";
import { InviteInbox } from "./InviteInbox";
import { FRIENDS_QUERY, setRightPanel, useRightPanel } from "@/lib/rightPanel";

export function TopBar() {
  const { username } = useAuth();
  const friendsPanelOpen = useRightPanel() === "friends";
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

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
            data-search-input
            enterKeyHint="search"
            placeholder="What do you want to listen to?"
            className="w-full min-w-0 bg-transparent text-base outline-none md:text-sm placeholder:text-spotify-gray"
          />
        </div>
      </form>

      <InviteInbox />
      {/* Narrow screens: the Friend activity page. Wide ones: re-open its panel if hidden. */}
      <Link
        to="/activity"
        aria-label="Friend activity"
        title="Friend activity"
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-spotify-gray hover:text-white ${friendsPanelOpen ? "xl:hidden" : ""}`}
        onClick={(e) => {
          if (window.matchMedia(FRIENDS_QUERY).matches) {
            e.preventDefault();
            setRightPanel("friends");
          }
        }}
      >
        <FriendsIcon className="h-5 w-5" />
      </Link>
      <Link
        to="/settings"
        aria-label="Settings"
        title="Settings"
        className="flex-shrink-0 rounded-full transition hover:scale-105"
      >
        <Avatar username={username} className="h-8 w-8" />
      </Link>
    </header>
  );
}
