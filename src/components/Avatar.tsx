import { useState } from "react";
import { useAvatarUrl } from "@/lib/avatars";

/**
 * Someone's profile picture, or the first letter of their name if they have
 * none. Size and text size come from `className` (e.g. "h-8 w-8 text-sm").
 */
export function Avatar({ username, className = "" }: { username: string | null | undefined; className?: string }) {
  const url = useAvatarUrl(username);
  const [failed, setFailed] = useState<string | null>(null);

  if (url && failed !== url) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setFailed(url)}
        className={`flex-shrink-0 rounded-full bg-white/20 object-cover ${className}`}
      />
    );
  }
  return (
    <span className={`flex flex-shrink-0 items-center justify-center rounded-full bg-white/20 font-bold text-white ${className}`}>
      {username?.[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
