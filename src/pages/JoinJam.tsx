import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useJam } from "@/context/JamContext";
import { getJam, parseJamCode, type JamState } from "@/api/jam";
import { Loading } from "@/components/Loading";
import { JamIcon } from "@/components/icons";

/** Landing page for invite links: /jam/:code */
export function JoinJam() {
  const params = useParams<{ code: string }>();
  const code = parseJamCode(params.code ?? "");
  const { jamId, joinJam } = useJam();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<JamState | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code || code === jamId) return;
    let cancelled = false;
    getJam(code)
      .then((snap) => !cancelled && setPreview(snap?.state ?? null))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [code, jamId]);

  if (code && code === jamId) return <Navigate to="/jam" replace />;

  if (error || !code || preview === null) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-16 text-center">
        <p className="text-lg font-semibold">{error ?? "This Jam has ended or the code is wrong."}</p>
        <Link to="/jam" className="rounded-full bg-white px-6 py-2 text-sm font-bold text-black">
          Back to Jam
        </Link>
      </div>
    );
  }

  if (preview === undefined) return <Loading label="Finding the Jam..." />;

  function handleJoin() {
    // This click also counts as the user gesture browsers require before
    // they let the Jam's audio start playing.
    joinJam(code!);
    navigate("/jam", { replace: true });
  }

  const current = preview.queue[preview.currentIndex]?.track;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 pt-10 text-center md:pt-16">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-spotify-green to-emerald-800">
        <JamIcon className="h-10 w-10 text-black" />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{preview.host} invited you to a Jam</h1>
        <p className="text-spotify-gray">
          {preview.members.length} listening
          {current ? ` · now playing ${current.title}${current.artist ? ` by ${current.artist}` : ""}` : ""}
        </p>
      </div>
      {jamId && <p className="rounded-md bg-white/10 px-4 py-2 text-sm">Joining will make you leave your current Jam.</p>}
      <button
        type="button"
        onClick={handleJoin}
        className="rounded-full bg-spotify-green px-8 py-3 font-bold text-black transition hover:scale-105 hover:bg-spotify-green-bright"
      >
        Join Jam
      </button>
    </div>
  );
}
