import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { SubsonicError } from "@/api/client";
import { getServerConfig, serversConfigurable, setServerConfig } from "@/lib/servers";

export function Login() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Desktop and mobile apps only: which servers to use.
  const [navidromeUrl, setNavidromeUrl] = useState("");
  const [jamUrl, setJamUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Set when Settings sends you here after switching servers.
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!serversConfigurable) return;
    void getServerConfig().then((config) => {
      setNavidromeUrl(config.navidromeUrl);
      setJamUrl(config.jamUrl);
    });
  }, []);

  if (!isLoading && isAuthenticated) {
    const from = (location.state as { from?: Location })?.from;
    return <Navigate to={from?.pathname ?? "/"} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    if (serversConfigurable) {
      try {
        await setServerConfig({ navidromeUrl, jamUrl });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setSubmitting(false);
        return;
      }
    }
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof SubsonicError) {
        setError(
          err.code === 40 || err.code === 41
            ? "Wrong username or password."
            : err.message,
        );
      } else {
        setError("Couldn't reach the server. Is Navidrome running?");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 pb-[calc(var(--safe-bottom)+1rem)] pt-[calc(var(--safe-top)+1rem)]">
      <div className="w-full max-w-sm rounded-lg bg-spotify-elevated-black p-8 shadow-2xl">
        <div className="mb-8 flex flex-col items-center gap-3">
          <svg viewBox="0 0 24 24" className="h-12 w-12">
            <circle cx={12} cy={12} r={12} fill="#1DB954" />
            <path d="M8 7.5v9l8-4.5z" fill="#121212" />
          </svg>
          <h1 className="text-2xl font-bold">Log in to Spotifion</h1>
          <p className="text-center text-sm text-spotify-gray">
            Use your Navidrome account credentials.
          </p>
          {notice && <p className="text-center text-sm font-semibold">{notice}</p>}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {serversConfigurable && (
            <>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                Navidrome server
                <input
                  type="url"
                  value={navidromeUrl}
                  onChange={(e) => setNavidromeUrl(e.target.value)}
                  placeholder="https://navidrome.example.com"
                  className="rounded-md border border-white/20 bg-transparent px-3 py-3 text-sm outline-none focus:border-white"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-semibold">
                <span>
                  Jam server <span className="font-normal text-spotify-gray">(optional)</span>
                </span>
                <input
                  type="url"
                  value={jamUrl}
                  onChange={(e) => setJamUrl(e.target.value)}
                  placeholder="https://spotifiak.example.com"
                  className="rounded-md border border-white/20 bg-transparent px-3 py-3 text-sm outline-none focus:border-white"
                />
                <span className="text-xs font-normal text-spotify-gray">
                  The address of the Spotifiak web app, to listen together with its users.
                </span>
              </label>
            </>
          )}
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Username
            <input
              autoFocus={!serversConfigurable}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-md border border-white/20 bg-transparent px-3 py-3 text-sm outline-none focus:border-white"
              autoComplete="username"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm font-semibold">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-white/20 bg-transparent px-3 py-3 text-sm outline-none focus:border-white"
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-full bg-spotify-green py-3 text-sm font-bold text-on-accent transition hover:scale-[1.02] hover:bg-spotify-green-bright disabled:opacity-50"
          >
            {submitting ? "Logging in..." : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}
