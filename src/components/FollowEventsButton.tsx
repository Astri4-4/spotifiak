import { useState } from "react";
import { Link } from "react-router-dom";
import { follow, unfollow, useEvents } from "@/lib/events";
import { showToast } from "@/lib/songMenu";
import { jamBase } from "@/lib/servers";
import { BellIcon } from "./icons";

/** Follows an artist's releases and concerts in the calendar. */
export function FollowEventsButton({ artist }: { artist: { id: string; name: string; musicBrainzId?: string } }) {
  const { artists } = useEvents();
  const [busy, setBusy] = useState(false);
  if (jamBase() === null) return null; // no Jam server, no calendar
  const following = artists.some((a) => a.id === artist.id);

  async function toggle() {
    setBusy(true);
    try {
      if (following) await unfollow(artist.id);
      else await follow({ id: artist.id, name: artist.name, mbid: artist.musicBrainzId });
      showToast(following ? `${artist.name} is off your calendar` : `${artist.name}'s releases and concerts are on your calendar`);
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        title="Releases and concerts in your calendar"
        className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold transition hover:scale-105 disabled:opacity-60 ${
          following ? "border-spotify-green text-spotify-green" : "border-white/50 hover:border-white"
        }`}
      >
        <BellIcon className="h-4 w-4" />
        {following ? "Following" : "Follow"}
      </button>
      {following && (
        <Link to="/calendar" className="text-sm font-semibold text-spotify-gray hover:text-white hover:underline">
          Calendar
        </Link>
      )}
    </span>
  );
}
