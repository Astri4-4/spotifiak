import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getPodcastFeed, type PodcastEpisode, type PodcastShow } from "@/api/podcasts";
import { usePlayer } from "@/context/PlayerContext";
import { episodeToTrack, follow, unfollow, usePodcasts } from "@/lib/podcasts";
import { showToast } from "@/lib/songMenu";
import { DetailHeader, PlayButton } from "@/components/DetailHeader";
import { EpisodeRow } from "@/components/EpisodeRow";
import { Loading } from "@/components/Loading";

/** Episodes shown at first, and added by "Show more". */
const PAGE = 50;

type Filter = "all" | "unplayed";

/** A show and its episodes: /podcast/:id (with ?feed=<url> for a show found in search). */
export function Podcast() {
  const { id = "" } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const feedUrl = params.get("feed") ?? undefined;
  const { shows, progress } = usePodcasts();
  const { playQueue } = usePlayer();
  const [feed, setFeed] = useState<{ show: PodcastShow; episodes: PodcastEpisode[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [filter, setFilter] = useState<Filter>("all");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFeed(null);
    setError(null);
    setShown(PAGE);
    getPodcastFeed({ id, feedUrl })
      .then((f) => !cancelled && setFeed(f))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [id, feedUrl]);

  if (error) return <p className="pt-8 text-sm text-red-400">{error}</p>;
  if (!feed) return <Loading />;

  const { show, episodes } = feed;
  const following = shows.some((s) => s.id === show.id);
  const listed = filter === "unplayed" ? episodes.filter((e) => !progress[e.id]?.done) : episodes;
  // Play: the newest episode you haven't finished.
  const next = episodes.find((e) => !progress[e.id]?.done);

  async function toggleFollow() {
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
    <div>
      <DetailHeader
        kind="Podcast"
        title={show.title}
        image={<img src={show.image || "/placeholder-cover.svg"} alt="" className="h-full w-full rounded object-cover" />}
        meta={
          <>
            {show.author && <span className="font-semibold text-white">{show.author}</span>}
            {show.author && " · "}
            {episodes.length} episodes
          </>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 sm:mt-6">
        <PlayButton
          label={next ? `Play ${next.title}` : "Play"}
          disabled={!next}
          onClick={() => next && playQueue([episodeToTrack(next)])}
        />
        <button
          type="button"
          onClick={toggleFollow}
          disabled={busy}
          className={`rounded-full border px-4 py-1.5 text-sm font-bold transition hover:scale-105 disabled:opacity-60 ${
            following ? "border-white/40 text-white" : "border-white/70 text-white hover:border-white"
          }`}
        >
          {following ? "Following" : "Follow"}
        </button>
      </div>

      {show.description && (
        <section className="mt-6 max-w-3xl">
          <h2 className="mb-2 text-xl font-bold">About</h2>
          <p className={`whitespace-pre-line text-sm text-spotify-gray ${aboutOpen ? "" : "line-clamp-3"}`}>{show.description}</p>
          <button type="button" onClick={() => setAboutOpen((v) => !v)} className="mt-1 text-sm font-semibold hover:underline">
            {aboutOpen ? "Show less" : "Show more"}
          </button>
        </section>
      )}

      <section className="mt-8 max-w-4xl">
        <div className="mb-2 flex items-center gap-2">
          <h2 className="mr-auto text-xl font-bold">Episodes</h2>
          {(["all", "unplayed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${filter === f ? "bg-white text-black" : "bg-spotify-highlight-black hover:bg-white/20"}`}
            >
              {f === "all" ? "All" : "Unplayed"}
            </button>
          ))}
        </div>
        {listed.length === 0 ? (
          <p className="py-4 text-sm text-spotify-gray">{filter === "unplayed" ? "You've played every episode." : "No episodes yet."}</p>
        ) : (
          listed.slice(0, shown).map((episode) => <EpisodeRow key={episode.id} episode={episode} />)
        )}
        {listed.length > shown && (
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="mt-4 rounded-full border border-white/40 px-4 py-1.5 text-sm font-bold hover:border-white"
          >
            Show more
          </button>
        )}
      </section>
    </div>
  );
}
