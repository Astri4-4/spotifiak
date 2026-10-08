import type { ReactNode } from "react";
import { PlayIcon } from "./icons";

interface DetailHeaderProps {
  /** Cover image, or any square visual (e.g. the Liked Songs gradient). */
  image: ReactNode;
  kind: string;
  title: string;
  meta?: ReactNode;
}

/** Shared hero header for album / artist / playlist pages. */
export function DetailHeader({ image, kind, title, meta }: DetailHeaderProps) {
  return (
    <div className="flex flex-col items-center gap-4 pt-6 sm:flex-row sm:items-end sm:gap-6 sm:pt-8">
      <div className="h-40 w-40 flex-shrink-0 shadow-2xl sm:h-36 sm:w-36 lg:h-48 lg:w-48 xl:h-56 xl:w-56">{image}</div>
      <div className="flex w-full min-w-0 flex-col gap-1 text-center sm:gap-2 sm:text-left">
        <span className="hidden text-xs font-semibold uppercase sm:block">{kind}</span>
        <h1
          // Scales with the viewport so long names shrink smoothly while resizing.
          className="line-clamp-2 break-words text-[clamp(1.5rem,2vw+0.75rem,4rem)] font-black leading-tight"
          title={title}
        >
          {title}
        </h1>
        {meta && <p className="text-sm text-spotify-gray">{meta}</p>}
      </div>
    </div>
  );
}

export function PlayButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-spotify-green text-black transition hover:scale-105 hover:bg-spotify-green-bright disabled:opacity-50 sm:h-14 sm:w-14"
      aria-label={label}
    >
      <PlayIcon className="h-5 w-5 fill-current pl-0.5 sm:h-6 sm:w-6 sm:pl-1" />
    </button>
  );
}
