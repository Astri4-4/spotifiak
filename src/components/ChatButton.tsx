import { Link } from "react-router-dom";
import { useUnreadCount } from "@/lib/chat";
import { ChatIcon } from "./icons";

/** The top bar's way to your conversations, with how many messages are unread. */
export function ChatButton() {
  const unread = useUnreadCount();
  const label = unread ? `Chat (${unread} unread)` : "Chat";
  return (
    <Link
      to="/chat"
      aria-label={label}
      title={label}
      className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-spotify-gray hover:text-white"
    >
      <ChatIcon className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-spotify-green px-1 text-[10px] font-bold text-on-accent">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
