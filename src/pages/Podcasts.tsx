import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getLatestEpisodes, searchPodcasts, type PodcastEpisode, type PodcastShow } from "@/api/podcasts";
import { follow, unfollow, usePodcasts } from "@/lib/podcasts";
import { showToast } from "@/lib/songMenu";
import { CardGrid } from "@/components/CardGrid";
import { EpisodeRow } from "@/components/EpisodeRow";
import { Loading } from "@/components/Loading";
import { MediaCard } from "@/components/MediaCard";
import { SearchIcon } from "@/components/icons";

const showLink = (show: PodcastShow) => `/podcast/${show.id}?feed=${encodeURIComponent(show.feedUrl)}`;

/** Your podcasts, their newest episodes, and finding more. */
export function Podcasts() {
  const { shows, loaded, persisted } = usePodcasts();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PodcastShow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [latest, setLatest] = useState<PodcastEpisode[] | null>(null);
  const [latestError, setLatestError] = useState<string | null>(null);
  const showIds = shows.map((s) => s.id).join(",");

  useEffect(() => {
    if (!loaded) return;
    if (!showIds) {
      setLatest([]);
      return;
    }
    let cancelled = false;
    getLatestEpisodes()
      .then((r) => !cancelled && setLatest(r.episodes))
      .catch((err: Error) => !cancelled && setLatestError(err.message));
    return () => {
      cancelled = true;
    };
  }, [loaded, showIds]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      setResults(await searchPodcasts(q));
    } catch (err) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="flex flex-col gap-8 pt-4 md:pt-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Podcasts</h1>
        <p className="mt-2 max-w-2xl text-sm text-spotify-gray">
          Follow shows and pick up episodes where you left them, on any of your devices.
        </p>
      </div>

      <section>
        <form onSubmit={handleSearch} className="flex max-w-2xl gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white/10 px-4 focus-within:ring-2 focus-within:ring-white/30">
            <SearchIcon className="h-5 w-5 flex-shrink-0 text-spotify-gray" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search podcasts, or paste an RSS link"
              aria-label="Search podcasts"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={searching}
            className="rounded-full bg-white px-5 text-sm font-bold text-black transition hover:scale-105 disabled:opacity-60"
          >
            Search
          </button>
        </form>
        {searchError && <p className="mt-3 text-sm text-red-400">{searchError}</p>}
        {searching ? (
          <Loading />
        ) : (
          results && (
            <div className="mt-4">
              {results.length === 0 ? (
                <p className="text-sm text-spotify-gray">No podcasts found.</p>
              ) : (
                <div className="flex max-w-3xl flex-col">
                  {results.map((show) => (
                    <ResultRow key={show.id} show={show} following={shows.some((s) => s.id === show.id)} />
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-bold">Your shows</h2>
        {!loaded ? (
          <Loading />
        ) : shows.length === 0 ? (
          <p className="text-sm text-spotify-gray">You don't follow any podcasts yet. Search for one above.</p>
        ) : (
          <CardGrid rowOnPhones>
            {shows.map((show) => (
              <MediaCard key={show.id} to={`/podcast/${show.id}`} image={show.image || "/placeholder-cover.svg"} title={show.title} subtitle={show.author} />
            ))}
          </CardGrid>
        )}
        {!persisted && (
          <p className="mt-4 text-xs text-spotify-gray">
            This server can't save podcasts (no writable <code>JAM_DATA_DIR</code>), so they're lost when it restarts.
          </p>
        )}
      </section>

      {shows.length > 0 && (
        <section className="max-w-4xl">
          <h2 className="mb-1 text-xl font-bold">New episodes</h2>
          {latestError ? (
            <p className="text-sm text-red-400">{latestError}</p>
          ) : latest === null ? (
            <Loading />
          ) : (
            latest.map((episode) => <EpisodeRow key={episode.id} episode={episode} showName />)
          )}
        </section>
      )}
    </div>
  );
}

function ResultRow({ show, following }: { show: PodcastShow; following: boolean }) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      if (following) await unfollow(show.id);
      else await follow(show.feedUrl);
      showToast(following ? `Unfollowed ${show.title}` : `Following ${show.title}`);
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md p-2 hover:bg-white/10">
      <Link to={showLink(show)} className="flex min-w-0 flex-1 items-center gap-3">
        <img src={show.image || "/placeholder-cover.svg"} alt="" loading="lazy" className="h-14 w-14 flex-shrink-0 rounded object-cover" />
        <span className="min-w-0">
          <span className="block truncate font-medium">{show.title}</span>
          <span className="block truncate text-sm text-spotify-gray">{show.author}</span>
        </span>
      </Link>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="flex-shrink-0 rounded-full border border-white/40 px-4 py-1 text-sm font-bold hover:border-white disabled:opacity-60"
      >
        {following ? "Following" : "Follow"}
      </button>
    </div>
  );
}
