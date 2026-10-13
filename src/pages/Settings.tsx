import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useJam } from "@/context/JamContext";
import { SubsonicError } from "@/api/client";
import { ping } from "@/api/subsonic";
import { jamServerReachable } from "@/api/jam";
import { CheckIcon, LogoutIcon } from "@/components/icons";
import { getServerConfig, serversConfigurable, setServerConfig, type ServerConfig } from "@/lib/servers";
import { ACCENT_COLORS, resolveTheme, setTheme, THEMES, useTheme, type Theme } from "@/lib/theme";
import {
  applyUpdate,
  checkForUpdates,
  updatesSupported,
  useUpdateStatus,
  type UpdateStatus,
} from "@/lib/updates";

const DEFAULT_THEME_IDS = ["dark", "light"];
const editorThemes = THEMES.filter((t) => !DEFAULT_THEME_IDS.includes(t.id));

export function Settings() {
  const { username, logout } = useAuth();
  const settings = useTheme();
  const theme = resolveTheme(settings.theme);

  return (
    <div className="mx-auto max-w-2xl pt-4 md:pt-6">
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">Settings</h1>

      <Section title="Account">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold">
            {username?.[0]?.toUpperCase() ?? "?"}
          </span>
          <p className="min-w-0 flex-1 truncate font-semibold">{username}</p>
          <button
            type="button"
            onClick={logout}
            className="flex flex-shrink-0 items-center gap-2 rounded-full border border-white/40 px-4 py-2 text-sm font-bold hover:border-white"
          >
            <LogoutIcon className="h-4 w-4" />
            Log out
          </button>
        </div>
      </Section>

      <Section title="Servers">
        {serversConfigurable ? (
          <ServerSettings />
        ) : (
          <p className="text-sm text-spotify-gray">
            This app's Navidrome and Jam servers are set by whoever deployed it (<code>NAVIDROME_URL</code>).
          </p>
        )}
      </Section>

      <Section title="Appearance">
        <p className="mb-3 text-sm font-semibold">Theme</p>
        <div role="radiogroup" aria-label="Theme">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            <ThemeOption
              label="System"
              selected={settings.theme === "system"}
              onSelect={() => setTheme({ theme: "system" })}
              preview={<ThemePreview theme={resolveTheme("dark")} split={resolveTheme("light")} accent={settings.accent} />}
            />
            {THEMES.filter((t) => DEFAULT_THEME_IDS.includes(t.id)).map((t) => (
              <ThemeOption
                key={t.id}
                label={t.name}
                selected={settings.theme === t.id}
                onSelect={() => setTheme({ theme: t.id })}
                preview={<ThemePreview theme={t} accent={settings.accent} />}
              />
            ))}
          </div>
          {settings.theme === "system" && (
            <p className="mt-2 text-xs text-spotify-gray">Dark or Light, following your device's setting.</p>
          )}

          <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-spotify-gray">Editor themes</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {editorThemes.map((t) => (
              <ThemeOption
                key={t.id}
                label={t.name}
                selected={settings.theme === t.id}
                onSelect={() => setTheme({ theme: t.id })}
                preview={<ThemePreview theme={t} accent={settings.accent} />}
              />
            ))}
          </div>
        </div>

        <p className="mb-3 mt-6 text-sm font-semibold">Accent color</p>
        <div role="radiogroup" aria-label="Accent color" className="flex flex-wrap gap-3">
          {ACCENT_COLORS.map((color) => {
            const selected = settings.accent === color.id;
            // Each theme has its own shade of every accent (and may lack one, e.g. pink).
            const { hex, label = color.label } = theme.accents[color.id];
            return (
              <button
                key={color.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={label}
                title={label}
                onClick={() => setTheme({ accent: color.id })}
                className={`flex h-10 w-10 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-spotify-base-black transition ${
                  selected ? "ring-white" : "ring-transparent hover:scale-110"
                }`}
                style={{ backgroundColor: hex }}
              >
                {selected && <CheckIcon className="h-5 w-5 text-pure-white drop-shadow" />}
              </button>
            );
          })}
        </div>
      </Section>

      {updatesSupported ? (
        <Section title="Updates">
          <UpdateSettings />
        </Section>
      ) : (
        <p className="pb-4 text-center text-xs text-spotify-gray">Spotifiak {__APP_VERSION__}</p>
      )}
    </div>
  );
}

/** Subsonic error codes meaning "these credentials don't work here". */
const AUTH_ERRORS = [40, 41];

type Status = { kind: "success" | "warning" | "error"; message: string } | null;

/** Navidrome and Jam server URLs, for the desktop and mobile apps. */
function ServerSettings() {
  const { logout } = useAuth();
  const { jamId, leaveJam } = useJam();
  const navigate = useNavigate();
  const [saved, setSaved] = useState<ServerConfig | null>(null);
  const [navidromeUrl, setNavidromeUrl] = useState("");
  const [jamUrl, setJamUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    void getServerConfig().then((config) => {
      setSaved(config);
      setNavidromeUrl(config.navidromeUrl);
      setJamUrl(config.jamUrl);
    });
  }, []);

  if (!saved) return null;
  const previous = saved;
  const changed = navidromeUrl.trim() !== saved.navidromeUrl || jamUrl.trim() !== saved.jamUrl;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      await save();
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    try {
      await setServerConfig({ navidromeUrl, jamUrl });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      return;
    }
    const next = await getServerConfig();

    if (next.navidromeUrl !== previous.navidromeUrl) {
      try {
        await ping();
      } catch (err) {
        if (err instanceof SubsonicError && AUTH_ERRORS.includes(err.code)) {
          // The server works, but not with this login: sign in there instead.
          logout();
          navigate("/login", { replace: true, state: { notice: `Log in to your account on ${next.navidromeUrl}.` } });
          return;
        }
        // Unreachable (or not Navidrome): keep the working settings.
        await setServerConfig(previous);
        setStatus({ kind: "error", message: `Couldn't connect to ${next.navidromeUrl}. Your settings weren't changed.` });
        return;
      }
    }

    // A Jam lives on the server it was started on.
    if (next.jamUrl !== previous.jamUrl && jamId) leaveJam();

    setSaved(next);
    setNavidromeUrl(next.navidromeUrl);
    setJamUrl(next.jamUrl);
    if (next.jamUrl && next.jamUrl !== previous.jamUrl && !(await jamServerReachable())) {
      setStatus({ kind: "warning", message: `Saved, but the Jam server at ${next.jamUrl} didn't respond, so Jam may not work.` });
      return;
    }
    setStatus({ kind: "success", message: "Saved." });
  }

  const inputClass =
    "rounded-md border border-white/20 bg-transparent px-3 py-3 text-sm font-normal outline-none focus:border-white";
  const statusColor = { success: "text-spotify-green", warning: "text-yellow-500", error: "text-red-400" };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-semibold">
        Navidrome server
        <input
          type="url"
          value={navidromeUrl}
          onChange={(e) => setNavidromeUrl(e.target.value)}
          placeholder="https://navidrome.example.com"
          className={inputClass}
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
          className={inputClass}
        />
        <span className="text-xs font-normal text-spotify-gray">
          The address of the Spotifiak web app, to listen together with its users.
        </span>
      </label>

      {status && <p className={`text-sm ${statusColor[status.kind]}`}>{status.message}</p>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-spotify-gray">
          {navidromeUrl.trim() !== saved.navidromeUrl && "Changing the Navidrome server may ask you to log in again."}
        </p>
        <button
          type="submit"
          disabled={!changed || saving}
          className="flex-shrink-0 rounded-full bg-spotify-green px-5 py-2 text-sm font-bold text-on-accent transition hover:bg-spotify-green-bright disabled:opacity-40"
        >
          {saving ? "Checking..." : "Save"}
        </button>
      </div>
    </form>
  );
}

const UPDATE_MESSAGES: Record<UpdateStatus["phase"], (s: UpdateStatus) => string> = {
  idle: () => "",
  checking: () => "Checking for updates...",
  downloading: (s) => `Downloading version ${s.version}...`,
  "up-to-date": () => "You're up to date.",
  ready: (s) => `Version ${s.version} is ready. It will be used the next time the app starts.`,
  error: (s) => s.message ?? "Couldn't check for updates.",
};

/** Current version and live updates, for the desktop and mobile apps. */
function UpdateSettings() {
  const status = useUpdateStatus();
  const busy = status.phase === "checking" || status.phase === "downloading";

  const message = UPDATE_MESSAGES[status.phase](status);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">Spotifiak {__APP_VERSION__}</p>
          {message && (
            <p className={`text-sm ${status.phase === "error" ? "text-red-400" : status.phase === "ready" ? "text-spotify-green" : "text-spotify-gray"}`}>
              {message}
            </p>
          )}
        </div>
        {status.phase === "ready" ? (
          <button
            type="button"
            onClick={() => void applyUpdate()}
            className="flex-shrink-0 rounded-full bg-spotify-green px-5 py-2 text-sm font-bold text-on-accent transition hover:bg-spotify-green-bright"
          >
            Restart now
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void checkForUpdates()}
            disabled={busy}
            className="flex-shrink-0 rounded-full border border-white/40 px-4 py-2 text-sm font-bold hover:border-white disabled:opacity-40"
          >
            Check for updates
          </button>
        )}
      </div>
      <p className="text-xs text-spotify-gray">
        Updates to the app itself download automatically. Some releases also need a new install of the app, which you'll be told about here.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6 rounded-lg bg-white/5 p-4 sm:p-5">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function ThemeOption({
  label,
  selected,
  onSelect,
  preview,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  preview: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex min-w-0 flex-col gap-2 rounded-lg p-2 text-left text-sm font-semibold ring-2 transition ${
        selected ? "ring-spotify-green" : "ring-transparent hover:bg-white/5"
      }`}
    >
      {preview}
      <span className="line-clamp-2 leading-tight">{label}</span>
    </button>
  );
}

/** A miniature of the app in a theme's colors; with `split`, the lower-right half shows a second theme. */
function ThemePreview({ theme, split, accent }: { theme: Theme; split?: Theme; accent: keyof Theme["accents"] }) {
  return (
    <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-md border border-white/10">
      <MiniApp theme={theme} accent={accent} />
      {split && (
        <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
          <MiniApp theme={split} accent={accent} />
        </span>
      )}
    </span>
  );
}

function MiniApp({ theme, accent }: { theme: Theme; accent: keyof Theme["accents"] }) {
  const { base, highlight, fg } = theme.colors;
  return (
    <span className="absolute inset-0 flex flex-col gap-1.5 p-2" style={{ backgroundColor: base }}>
      <span className="h-2 w-3/4 rounded-full" style={{ backgroundColor: highlight }} />
      <span className="flex flex-1 gap-1.5">
        <span className="flex-1 rounded-sm" style={{ backgroundColor: theme.accents[accent].hex }} />
        <span className="flex-1 rounded-sm" style={{ backgroundColor: highlight }} />
      </span>
      <span className="h-1.5 w-1/2 rounded-full opacity-70" style={{ backgroundColor: fg }} />
    </span>
  );
}
