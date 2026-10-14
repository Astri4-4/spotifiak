import type { SmartPlaylist } from "@/lib/smartPlaylists";
import { SparkleIcon } from "./icons";

/** A smart playlist's cover: its gradient and a sparkle. */
export function SmartPlaylistArt({ playlist }: { playlist: SmartPlaylist }) {
  return (
    <span className={`flex h-full w-full items-center justify-center rounded bg-gradient-to-br ${playlist.gradient}`}>
      <SparkleIcon className="h-1/3 w-1/3 text-pure-white" />
    </span>
  );
}
