import { SearchIcon, CloseIcon } from "./icons";
import type { SortOption } from "@/lib/listSort";

/** A field to find something in a list, and how to sort it. */
export function ListControls<T>({
  query,
  onQuery,
  placeholder,
  sort,
  sorts,
  onSort,
}: {
  query: string;
  onQuery: (query: string) => void;
  placeholder: string;
  sort: SortOption<T>;
  sorts: SortOption<T>[];
  onSort: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex min-w-0 max-w-xs flex-1 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 focus-within:ring-2 focus-within:ring-white">
        <SearchIcon className="h-4 w-4 flex-shrink-0 text-spotify-gray" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          type="search"
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-spotify-gray md:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button type="button" onClick={() => onQuery("")} aria-label="Clear" className="text-spotify-gray hover:text-white">
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </label>
      <label className="flex items-center gap-2 text-sm text-spotify-gray">
        Sort by
        <select
          value={sort.id}
          onChange={(e) => onSort(e.target.value)}
          className="rounded-md bg-white/10 px-2 py-1.5 font-semibold text-white outline-none focus:ring-2 focus:ring-white [&>option]:bg-spotify-highlight-black"
        >
          {sorts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
