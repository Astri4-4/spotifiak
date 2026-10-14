import { coverArtUrl } from "@/api/subsonic";
import { MixIcon } from "./icons";

/** A mix's cover: the covers of its first songs in a 2x2 grid, or a gradient. */
export function MixArt({ coverArts, className = "" }: { coverArts: (string | undefined)[]; className?: string }) {
  const covers = [...new Set(coverArts.filter(Boolean))].slice(0, 4) as string[];
  if (covers.length < 4) {
    return (
      <span className={`flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-spotify-green to-fuchsia-500 ${className}`}>
        <MixIcon className="h-1/3 w-1/3 text-pure-white" />
      </span>
    );
  }
  return (
    <span className={`grid h-full w-full grid-cols-2 overflow-hidden rounded ${className}`}>
      {covers.map((c) => (
        <img key={c} src={coverArtUrl(c, 150)} alt="" className="h-full w-full object-cover" />
      ))}
    </span>
  );
}
