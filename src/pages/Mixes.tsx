import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createMix, getMixes, parseMixCode, type MixSummary } from "@/api/mixes";
import { getMyTopSongs } from "@/lib/mixes";
import { Loading } from "@/components/Loading";
import { MixArt } from "@/components/MixArt";

/** Your mixes, and making or joining one. */
export function Mixes() {
  const navigate = useNavigate();
  const [mixes, setMixes] = useState<(MixSummary & { covers: (string | undefined)[] })[] | null>(null);
  const [persisted, setPersisted] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    getMixes()
      .then((r) => {
        setMixes(r.mixes);
        setPersisted(r.persisted);
      })
      .catch((err: Error) => setLoadError(err.message));
    // Start working out your top songs now; creating a mix needs them.
    getMyTopSongs().catch(() => void 0);
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const mix = await createMix(name.trim(), await getMyTopSongs());
      navigate(`/mix/${mix.id}`);
    } catch (err) {
      setCreateError((err as Error).message);
      setCreating(false);
    }
  }

  function handleJoin(e: FormEvent) {
    e.preventDefault();
    const parsed = parseMixCode(code);
    if (!parsed) {
      setCodeError("Enter the 6-character code or paste the invite link.");
      return;
    }
    navigate(`/mix/${parsed}`);
  }

  return (
    <div className="flex flex-col gap-8 pt-4 md:pt-6">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Mixes</h1>
        <p className="mt-2 max-w-2xl text-sm text-spotify-gray">
          A mix blends your most played songs with your friends' into one playlist, and keeps up as you all listen.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form onSubmit={handleCreate} className="flex flex-col gap-3 rounded-lg bg-white/5 p-4 sm:p-5">
          <h2 className="font-bold">Make a mix</h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="Name (optional)"
            className="rounded-full bg-black/40 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-white/30"
          />
          <button
            type="submit"
            disabled={creating}
            className="self-start rounded-full bg-spotify-green px-6 py-2 text-sm font-bold text-on-accent transition hover:scale-105 hover:bg-spotify-green-bright disabled:opacity-60 disabled:hover:scale-100"
          >
            {creating ? "Finding your top songs…" : "Create mix"}
          </button>
          {createError && <p className="text-sm text-red-400">{createError}</p>}
          <p className="text-xs text-spotify-gray">
            Your 50 most played songs (topped up with liked ones) go in, and people you invite see them.
          </p>
        </form>

        <form onSubmit={handleJoin} className="flex flex-col gap-3 rounded-lg bg-white/5 p-4 sm:p-5">
          <h2 className="font-bold">Join a friend's mix</h2>
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError(null);
            }}
            placeholder="Mix code or invite link"
            className="rounded-full bg-black/40 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-white/30"
          />
          <button type="submit" className="self-start rounded-full bg-white px-6 py-2 text-sm font-bold text-black hover:scale-105">
            Continue
          </button>
          {codeError && <p className="text-sm text-red-400">{codeError}</p>}
        </form>
      </div>

      <section>
        <h2 className="mb-3 text-xl font-bold">Your mixes</h2>
        {loadError ? (
          <p className="text-sm text-red-400">{loadError}</p>
        ) : mixes === null ? (
          <Loading />
        ) : mixes.length === 0 ? (
          <p className="text-sm text-spotify-gray">No mixes yet. Make one and send the link to a friend.</p>
        ) : (
          <div className="flex flex-col">
            {mixes.map((mix) => (
              <Link key={mix.id} to={`/mix/${mix.id}`} className="flex items-center gap-3 rounded-md p-2 hover:bg-white/10">
                <span className="h-12 w-12 flex-shrink-0">
                  <MixArt coverArts={mix.covers} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{mix.name}</span>
                  <span className="block truncate text-sm text-spotify-gray">
                    {mix.members.map((m) => m.username).join(", ")}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
        {!persisted && (
          <p className="mt-4 text-xs text-spotify-gray">
            This server can't save mixes (no writable <code>JAM_DATA_DIR</code>), so they're lost when it restarts.
          </p>
        )}
      </section>
    </div>
  );
}
