import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAlbumList2 } from "@/api/subsonic";
import { getIcsUrl, setEventsCountry, type CalendarEvent } from "@/api/events";
import { applyEvents, follow, formatEventDate, markSeen, unfollow, useEvents } from "@/lib/events";
import { showToast } from "@/lib/songMenu";
import { Loading } from "@/components/Loading";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon } from "@/components/icons";

type Kind = "all" | "release" | "concert";
type View = "list" | "month";

/** Where Ticketmaster sells tickets. */
const COUNTRIES = ["FR", "BE", "CH", "LU", "CA", "GB", "IE", "DE", "AT", "NL", "ES", "IT", "PL", "DK", "NO", "SE", "FI", "US", "MX", "AU", "NZ"];
const countryName = (code: string) => {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

const todayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Upcoming releases and concerts of the artists you follow. */
export function Calendar() {
  const { artists, events, country, concertsAvailable, pending, loaded, persisted } = useEvents();
  const [kind, setKind] = useState<Kind>("all");
  const [view, setView] = useState<View>("list");
  // What was new when the page opened stays marked while you're on it.
  const [wasNew, setWasNew] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loaded) return;
    markSeen()
      .then((ids) => ids.size && setWasNew(ids))
      .catch(() => void 0);
  }, [loaded]);

  const shown = useMemo(
    () => events.filter((e) => kind === "all" || e.kind === kind).map((e) => ({ ...e, isNew: e.isNew || wasNew.has(e.id) })),
    [events, kind, wasNew],
  );

  if (!loaded) return <Loading />;

  return (
    <div className="flex flex-col gap-6 pt-4 md:pt-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Calendar</h1>
        <p className="mt-2 max-w-2xl text-sm text-spotify-gray">
          New releases and concerts from the artists you follow. Follow more from their pages, or from your most played below.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "release", "concert"] as const).map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
            {k === "all" ? "All" : k === "release" ? "Releases" : "Concerts"}
          </Chip>
        ))}
        <span className="mx-1 hidden h-5 w-px bg-white/20 sm:block" />
        <Chip active={view === "list"} onClick={() => setView("list")}>
          List
        </Chip>
        <Chip active={view === "month"} onClick={() => setView("month")}>
          Month
        </Chip>
        {concertsAvailable && (
          <select
            value={country}
            onChange={(e) => void setEventsCountry(e.target.value).then(applyEvents).catch((err: Error) => showToast(err.message))}
            aria-label="Concerts in"
            className="ml-auto rounded-full bg-spotify-highlight-black px-3 py-1.5 text-sm outline-none"
          >
            <option value="">Concerts everywhere</option>
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                Concerts in {countryName(c)}
              </option>
            ))}
          </select>
        )}
      </div>

      {pending > 0 && <p className="text-sm text-spotify-gray">Looking up {pending} artist{pending === 1 ? "" : "s"}…</p>}
      {!concertsAvailable && kind !== "release" && (
        <p className="text-sm text-spotify-gray">Concerts show up once a Navidrome admin adds a Ticketmaster key in Settings → Calendar.</p>
      )}

      {artists.length === 0 ? (
        <p className="text-sm text-spotify-gray">You don't follow any artists yet.</p>
      ) : view === "list" ? (
        <EventList events={shown} />
      ) : (
        <MonthView events={shown} />
      )}

      <FollowedArtists />
      <Subscribe />
      {!persisted && (
        <p className="text-xs text-spotify-gray">
          This server can't save the calendar (no writable <code>JAM_DATA_DIR</code>), so it's lost when it restarts.
        </p>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "bg-white text-black" : "bg-spotify-highlight-black hover:bg-white/20"}`}
    >
      {children}
    </button>
  );
}

/** Upcoming events by month, then what came out lately. */
function EventList({ events }: { events: CalendarEvent[] }) {
  const today = todayString();
  const upcoming = events.filter((e) => e.date >= today || e.date.length < 10);
  const recent = events.filter((e) => e.date < today && e.date.length === 10).reverse();

  const months = new Map<string, CalendarEvent[]>();
  for (const e of upcoming) {
    const key = e.date.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), e]);
  }

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {upcoming.length === 0 && <p className="text-sm text-spotify-gray">Nothing announced yet.</p>}
      {[...months].map(([month, list]) => (
        <section key={month}>
          <h2 className="mb-2 text-lg font-bold capitalize">{formatEventDate(month)}</h2>
          {list.map((e) => (
            <EventRow key={`${e.id}-${e.artistId}`} event={e} />
          ))}
        </section>
      ))}
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">Recently released</h2>
          {recent.map((e) => (
            <EventRow key={`${e.id}-${e.artistId}`} event={e} />
          ))}
        </section>
      )}
    </div>
  );
}

function EventRow({ event }: { event: CalendarEvent }) {
  const [imageFailed, setImageFailed] = useState(false);
  const [y, m, d] = event.date.split("-").map(Number);
  const day = d ? new Date(y, m - 1, d) : null;
  const where = [event.venue, event.city, event.countryCode].filter(Boolean).join(", ");
  const cancelled = event.status === "cancelled";

  return (
    <div className="flex items-center gap-3 rounded-md p-2 hover:bg-white/10 sm:gap-4">
      <span className="flex w-12 flex-shrink-0 flex-col items-center leading-tight">
        {day ? (
          <>
            <span className="text-[11px] font-semibold uppercase text-spotify-gray">{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
            <span className="text-xl font-bold">{d}</span>
          </>
        ) : (
          <span className="text-xs font-semibold text-spotify-gray">TBA</span>
        )}
      </span>
      {event.image && !imageFailed ? (
        <img
          src={event.image}
          alt=""
          loading="lazy"
          onError={() => setImageFailed(true)}
          className={`h-12 flex-shrink-0 rounded object-cover ${event.kind === "concert" ? "w-20" : "w-12"}`}
        />
      ) : (
        <span className={`h-12 flex-shrink-0 rounded bg-white/10 ${event.kind === "concert" ? "w-20" : "w-12"}`} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <a
            href={event.url}
            target="_blank"
            rel="noreferrer"
            className={`truncate font-semibold hover:underline ${cancelled ? "line-through opacity-60" : ""}`}
          >
            {event.kind === "release" ? event.title : where || event.title}
          </a>
          {event.isNew && <span className="flex-shrink-0 rounded-full bg-spotify-green px-2 py-0.5 text-[10px] font-bold uppercase text-on-accent">New</span>}
          {event.status && <span className="flex-shrink-0 text-xs font-semibold capitalize text-yellow-500">{event.status}</span>}
        </span>
        <span className="block truncate text-sm text-spotify-gray">
          <Link to={`/artist/${event.artistId}`} className="hover:text-white hover:underline">
            {event.artistName}
          </Link>
          {" · "}
          {event.kind === "release" ? event.type : [event.time, event.title].filter(Boolean).join(" · ")}
        </span>
      </span>
      <a
        href={event.url}
        target="_blank"
        rel="noreferrer"
        className="hidden flex-shrink-0 text-xs font-semibold text-spotify-gray hover:text-white sm:block"
      >
        {event.kind === "concert" ? "Tickets ↗" : "Details ↗"}
      </a>
    </div>
  );
}

/** A month's grid with a dot per event; picking a day lists its events. */
function MonthView({ events }: { events: CalendarEvent[] }) {
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [picked, setPicked] = useState<string | null>(null);
  const today = todayString();

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) if (e.date.length === 10) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  const year = month.getFullYear();
  const m = month.getMonth();
  const firstWeekday = (new Date(year, m, 1).getDay() + 6) % 7; // weeks start on Monday
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const key = (d: number) => `${year}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" }));
  const shownDay = picked && picked.startsWith(key(1).slice(0, 7)) ? picked : null;

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(year, m - 1, 1))} className="rounded-full p-2 hover:bg-white/10">
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-bold capitalize">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(year, m + 1, 1))} className="rounded-full p-2 hover:bg-white/10">
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-spotify-gray">
        {weekdays.map((w, i) => (
          <span key={i} className="py-1 font-semibold">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`blank-${i}`} />;
          const list = byDay.get(key(d)) ?? [];
          const isToday = key(d) === today;
          return (
            <button
              key={d}
              type="button"
              disabled={!list.length}
              onClick={() => setPicked(key(d))}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-md text-sm ${
                shownDay === key(d) ? "bg-white text-black" : list.length ? "bg-white/10 text-white hover:bg-white/20" : ""
              } ${isToday && shownDay !== key(d) ? "ring-1 ring-spotify-green" : ""}`}
            >
              {d}
              {list.length > 0 && (
                <span className="flex gap-0.5">
                  {list.slice(0, 3).map((e) => (
                    <span key={`${e.id}-${e.artistId}`} className={`h-1.5 w-1.5 rounded-full ${e.kind === "release" ? "bg-spotify-green" : "bg-sky-400"}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex gap-4 text-xs text-spotify-gray">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-spotify-green" /> Release
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-400" /> Concert
        </span>
      </p>
      {shownDay && (
        <section className="mt-4">
          <h3 className="mb-1 font-bold capitalize">{formatEventDate(shownDay, true)}</h3>
          {(byDay.get(shownDay) ?? []).map((e) => (
            <EventRow key={`${e.id}-${e.artistId}`} event={e} />
          ))}
        </section>
      )}
    </div>
  );
}

/** The artists you follow, and your most played ones to add. */
function FollowedArtists() {
  const { artists } = useEvents();
  const [suggestions, setSuggestions] = useState<{ id: string; name: string }[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Your most played albums' artists, most played first.
    getAlbumList2("frequent", 100)
      .then((albums) => {
        const seen = new Map<string, string>();
        for (const a of albums) if (a.artistId && a.artist && !seen.has(a.artistId)) seen.set(a.artistId, a.artist);
        setSuggestions([...seen].map(([id, name]) => ({ id, name })));
      })
      .catch(() => setSuggestions([]));
  }, []);

  async function run(id: string, task: () => Promise<void>) {
    setBusy(id);
    try {
      await task();
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const followed = new Set(artists.map((a) => a.id));
  const toSuggest = (suggestions ?? []).filter((s) => !followed.has(s.id)).slice(0, 12);

  return (
    <section className="max-w-4xl rounded-lg bg-white/5 p-4 sm:p-5">
      <h2 className="mb-3 font-bold">Artists you follow</h2>
      {artists.length === 0 ? (
        <p className="text-sm text-spotify-gray">None yet. Follow an artist from their page, or pick some below.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {artists.map((a) => (
            <span key={a.id} className="flex items-center gap-1 rounded-full bg-spotify-highlight-black py-1 pl-3 pr-1 text-sm">
              <Link to={`/artist/${a.id}`} className="hover:underline">
                {a.name}
              </Link>
              {a.matched === false && (
                <span className="text-xs text-yellow-500" title="Not found on MusicBrainz: no releases for them">
                  (no releases)
                </span>
              )}
              <button
                type="button"
                aria-label={`Unfollow ${a.name}`}
                disabled={busy === a.id}
                onClick={() => void run(a.id, () => unfollow(a.id))}
                className="rounded-full p-1 text-spotify-gray hover:bg-white/10 hover:text-white"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {toSuggest.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-semibold text-spotify-gray">From what you play the most</h3>
          <div className="flex flex-wrap gap-2">
            {toSuggest.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy === s.id}
                onClick={() => void run(s.id, () => follow(s))}
                className="flex items-center gap-1 rounded-full border border-white/30 px-3 py-1 text-sm hover:border-white disabled:opacity-50"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                {s.name}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** The private link to add the calendar to Google Calendar, Apple Calendar... */
function Subscribe() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(reset = false) {
    setError(null);
    try {
      setUrl(await getIcsUrl(reset));
      if (reset) showToast("New link made: the old one stopped working");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      showToast("Couldn't copy the link");
    }
  }

  return (
    <section className="max-w-4xl rounded-lg bg-white/5 p-4 sm:p-5">
      <h2 className="mb-1 font-bold">Add to your calendar</h2>
      <p className="mb-3 text-sm text-spotify-gray">
        Subscribe from Google Calendar, Apple Calendar or Outlook: they keep it up to date. The link is private: anyone who has it
        sees your calendar.
      </p>
      {!url ? (
        <button type="button" onClick={() => void load()} className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-black hover:scale-105">
          Get the link
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="rounded-md border border-white/20 bg-transparent px-3 py-2 text-xs outline-none" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()} className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-black hover:scale-105">
              Copy link
            </button>
            <a href={url.replace(/^https?:/, "webcal:")} className="rounded-full border border-white/40 px-4 py-1.5 text-sm font-bold hover:border-white">
              Open in calendar app
            </a>
            <button type="button" onClick={() => void load(true)} className="rounded-full px-4 py-1.5 text-sm font-semibold text-spotify-gray hover:text-white">
              Make a new link
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </section>
  );
}
