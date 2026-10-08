import { Link } from "react-router-dom";
import { PlayIcon } from "./icons";

interface MediaCardProps {
  to: string;
  image: string;
  title: string;
  subtitle?: string;
  /** Artists render as circular portraits; albums/playlists as square covers. */
  round?: boolean;
  onPlay?: () => void;
}

export function MediaCard({ to, image, title, subtitle, round, onPlay }: MediaCardProps) {
  return (
    <Link
      to={to}
      className="group relative flex min-w-0 flex-col gap-3 rounded-md bg-spotify-elevated-black/60 p-3 sm:p-4 transition-colors hover:bg-spotify-highlight-black"
    >
      <div className="relative">
        <img
          src={image}
          alt=""
          loading="lazy"
          className={`aspect-square w-full object-cover shadow-lg ${round ? "rounded-full" : "rounded"}`}
        />
        {onPlay && (
          <button
            type="button"
            aria-label={`Play ${title}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPlay();
            }}
            className="absolute bottom-2 right-2 hidden h-11 w-11 [@media(hover:hover)]:flex translate-y-2 items-center justify-center rounded-full bg-spotify-green opacity-0 shadow-xl transition-all duration-200 hover:scale-105 hover:bg-spotify-green-bright group-hover:translate-y-0 group-hover:opacity-100"
          >
            <PlayIcon className="h-5 w-5 fill-black pl-0.5" />
          </button>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-white" title={title}>{title}</p>
        {subtitle && <p className="line-clamp-2 mt-1 text-sm text-spotify-gray">{subtitle}</p>}
      </div>
    </Link>
  );
}
