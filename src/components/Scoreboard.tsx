import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatDurationLong } from "@/lib/format";
import { useScoreboard } from "@/lib/scoreboard";
import { useShareListening } from "@/lib/sharing";
import type { CommonArtist, ScoreboardArtist, ScoreboardUser } from "@/api/scoreboard";
import { Loading } from "./Loading";

const MEDALS = ["bg-[#d4af37] text-black", "bg-[#c0c0c0] text-black", "bg-[#cd7f32] text-black"];

/** Who listened the most this week, and the artists friends have in common. */
export function Scoreboard() {
  const result = useScoreboard();
  const { username } = useAuth();
  const sharing = useShareListening();

  if (result === null) return <Loading />;
  if ("error" in result) return <p className="px-2 py-6 text-center text-sm text-spotify-gray">{result.error}</p>;
  const { users, common } = result.board;

  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 pb-1 text-xs text-spotify-gray">Since Monday</p>
      {users.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-spotify-gray">
          No one has listened to anything this week yet. Songs count once they're half played.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {users.map((user, i) => (
            <RankRow key={user.username} user={user} rank={i} isMe={user.username === username} />
          ))}
        </ol>
      )}

      {common.length > 0 && (
        <>
          <h3 className="mt-4 px-2 text-sm font-bold">Artists in common</h3>
          <ul className="flex flex-col">
            {common.map((artist) => (
              <CommonRow key={artist.id || artist.name} artist={artist} me={username} />
            ))}
          </ul>
        </>
      )}

      {!sharing && (
        <p className="mt-2 px-2 text-xs text-spotify-gray">
          You're not on the board: you're not sharing what you listen to.{" "}
          <Link to="/settings" className="underline hover:text-white">
            Change in Settings
          </Link>
        </p>
      )}
    </div>
  );
}

function ArtistName({ artist }: { artist: ScoreboardArtist }) {
  return artist.id ? (
    <Link to={`/artist/${artist.id}`} className="hover:underline">
      {artist.name}
    </Link>
  ) : (
    <>{artist.name}</>
  );
}

function RankRow({ user, rank, isMe }: { user: ScoreboardUser; rank: number; isMe: boolean }) {
  return (
    <li className={`flex items-center gap-3 rounded-md p-2 ${isMe ? "bg-white/5" : "hover:bg-white/5"}`}>
      <span
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${MEDALS[rank] ?? "text-spotify-gray"}`}
      >
        {rank + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold">
            {user.username}
            {isMe && <span className="font-normal text-spotify-gray"> (you)</span>}
          </p>
          <span className="flex-shrink-0 text-xs text-spotify-gray" title={`${user.plays} songs`}>
            {formatDurationLong(user.seconds) || "0 min"}
          </span>
        </div>
        {user.topArtists.length > 0 && (
          <p className="truncate text-xs text-spotify-gray">
            {user.topArtists.map((a, i) => (
              <span key={a.id || a.name}>
                {i > 0 && ", "}
                <ArtistName artist={a} />
              </span>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

function CommonRow({ artist, me }: { artist: CommonArtist; me: string | null }) {
  // You first, then the others.
  const listeners = [...artist.listeners].sort((a, b) => Number(b === me) - Number(a === me) || a.localeCompare(b));
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <ArtistName artist={artist} />
        </p>
        <p className="truncate text-xs text-spotify-gray">
          {listeners.map((l) => (l === me ? "You" : l)).join(", ")}
        </p>
      </div>
      <span className="flex flex-shrink-0 -space-x-1.5">
        {listeners.slice(0, 4).map((l) => (
          <span
            key={l}
            title={l}
            className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-spotify-base-black bg-white/20 text-[10px] font-bold"
          >
            {l[0]?.toUpperCase()}
          </span>
        ))}
      </span>
    </li>
  );
}
