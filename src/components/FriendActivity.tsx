import { Link } from "react-router-dom";
import { coverArtUrl } from "@/api/subsonic";
import { usePlayer } from "@/context/PlayerContext";
import { useFriendActivity } from "@/lib/friendActivity";
import { useShareListening } from "@/lib/sharing";
import type { NowPlayingEntry } from "@/types/subsonic";
import { Loading } from "./Loading";
import { Avatar } from "./Avatar";
import { PlayIcon } from "./icons";

/** What the other users of the server are listening to, like Spotify's Friend Activity. */
export function FriendActivity() {
  const entries = useFriendActivity();
  const sharing = useShareListening();

  if (entries === null) return <Loading />;

  return (
    <div className="flex flex-col gap-1">
      {entries.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-spotify-gray">
          No one else is listening right now. When other people on this Navidrome server play something, it shows up
          here.
        </p>
      ) : (
        entries.map((entry) => <FriendEntry key={entry.username} entry={entry} />)
      )}
      {!sharing && (
        <p className="mt-2 px-2 text-xs text-spotify-gray">
          You're not sharing what you listen to.{" "}
          <Link to="/settings" className="underline hover:text-white">
            Change in Settings
          </Link>
        </p>
      )}
    </div>
  );
}

function timeAgo(minutes: number): string {
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h`;
}

function FriendEntry({ entry }: { entry: NowPlayingEntry }) {
  const { playQueue } = usePlayer();
  // Still within the song: they're most likely still listening.
  const live = entry.duration ? entry.minutesAgo * 60 < entry.duration : entry.minutesAgo < 5;

  return (
    <div className="group flex items-center gap-3 rounded-md p-2 hover:bg-white/5">
      <span className="relative flex-shrink-0">
        <Avatar username={entry.username} className="h-11 w-11 text-sm" />
        {live && (
          <span
            className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-spotify-base-black bg-spotify-green"
            title="Listening now"
          />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold">{entry.username}</p>
          <span className="flex-shrink-0 text-xs text-spotify-gray">{timeAgo(entry.minutesAgo)}</span>
        </div>
        <p className="truncate text-sm text-spotify-gray">
          {entry.albumId ? (
            <Link to={`/album/${entry.albumId}`} className="text-white/90 hover:underline">
              {entry.title}
            </Link>
          ) : (
            entry.title
          )}
          {entry.artist && (
            <>
              {" · "}
              {entry.artistId ? (
                <Link to={`/artist/${entry.artistId}`} className="hover:underline">
                  {entry.artist}
                </Link>
              ) : (
                entry.artist
              )}
            </>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={() => playQueue([entry])}
        aria-label={`Play ${entry.title}`}
        title="Play this song"
        className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded"
      >
        <img src={coverArtUrl(entry.coverArt, 80)} alt="" className="h-full w-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100 [@media(hover:none)]:opacity-0">
          <PlayIcon className="h-5 w-5 fill-pure-white" />
        </span>
      </button>
    </div>
  );
}
