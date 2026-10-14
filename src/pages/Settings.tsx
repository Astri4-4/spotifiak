import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useJam } from "@/context/JamContext";
import { useConnect } from "@/context/PlayerContext";
import { defaultDeviceName } from "@/lib/device";
import { setShareListening, useShareListening } from "@/lib/sharing";
import { setOnlineLyrics, useOnlineLyrics } from "@/lib/lyrics";
import { SubsonicError } from "@/api/client";
import { ping } from "@/api/subsonic";
import { checkJamServer } from "@/api/jam";
import { CheckIcon, LogoutIcon } from "@/components/icons";
import { Avatar } from "@/components/Avatar";
import { removeMyAvatar, setMyAvatar, useAvatarUrl } from "@/lib/avatars";
import { setShortcutsOpen } from "@/lib/shortcutsDialog";
import { setDiscoverConfig, useDiscoverConfig } from "@/lib/discover";
import { setDiscoverUrl } from "@/api/discover";
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
          <Avatar username={username} className="h-16 w-16 text-2xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{username}</p>
            {username && <ProfilePictureButtons username={username} />}
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex flex-shrink-0 items-center gap-2 rounded-full border border-white/40 px-4 py-2 text-sm font-bold hover:border-white"
          >
            <LogoutIcon className="h-4 w-4" />
            Log out
          </button>
        </div>
        <DeviceName />
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

      <Section title="Privacy">
        <ShareListeningToggle />
        <OnlineLyricsToggle />
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

      <Section title="Discover">
        <DiscoverSettings />
      </Section>

      {/* Only where there's likely a keyboard: devices with a mouse or trackpad. */}
      <div className="hidden [@media(hover:hover)]:block">
        <Section title="Keyboard shortcuts">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-spotify-gray">
              Control playback, search and more from the keyboard. Press <kbd className="rounded bg-white/10 px-1.5 font-sans text-xs font-semibold">?</kbd> anywhere to see them.
            </p>
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="flex-shrink-0 rounded-full border border-white/40 px-4 py-2 text-sm font-bold hover:border-white"
            >
              Show shortcuts
            </button>
          </div>
        </Section>
      </div>

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

function ShareListeningToggle() {
  const sharing = useShareListening();
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Share what I'm listening to</span>
        <span className="block text-xs text-spotify-gray">
          Other people on this Navidrome server see the song you're playing in Friend activity. Your plays are still
          saved to your own history either way.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={sharing}
        onChange={(e) => setShareListening(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-6 w-11 flex-shrink-0 rounded-full bg-white/30 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-pure-white after:shadow after:transition peer-checked:bg-spotify-green peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-white"
      />
    </label>
  );
}

/** Choose, replace or remove your profile picture. */
function ProfilePictureButtons({ username }: { username: string }) {
  const hasPicture = useAvatarUrl(username) !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <label className={`cursor-pointer font-semibold text-spotify-gray hover:text-white ${busy ? "pointer-events-none opacity-50" : ""}`}>
          {busy ? "Saving…" : hasPicture ? "Change picture" : "Add a picture"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void run(() => setMyAvatar(username, file));
            }}
          />
        </label>
        {hasPicture && !busy && (
          <button
            type="button"
            onClick={() => void run(() => removeMyAvatar(username))}
            className="font-semibold text-spotify-gray hover:text-white"
          >
            Remove
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
function OnlineLyricsToggle() {
  const online = useOnlineLyrics();
  return (
    <label className="mt-4 flex cursor-pointer items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Find lyrics online</span>
        <span className="block text-xs text-spotify-gray">
          When your server has no synced lyrics for a song, look them up on LRCLIB (lrclib.net), which is sent the
          song's title, artist and album.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={online}
        onChange={(e) => setOnlineLyrics(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="relative h-6 w-11 flex-shrink-0 rounded-full bg-white/30 transition after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-pure-white after:shadow after:transition peer-checked:bg-spotify-green peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-white"
      />
    </label>
  );
}

/** This device's name, as your other devices see it in their device list. */
function DeviceName() {
  const { thisDevice, renameDevice } = useConnect();
  const [name, setName] = useState(thisDevice.name);
  const changed = name.trim() !== thisDevice.name && !(name.trim() === "" && thisDevice.name === defaultDeviceName());

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        renameDevice(name);
        setName(name.trim() || defaultDeviceName());
      }}
      className="mt-5 flex flex-col gap-2"
    >
      <label htmlFor="device-name" className="text-sm font-semibold">
        This device's name
      </label>
      <div className="flex gap-3">
        <input
          id="device-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={defaultDeviceName()}
          maxLength={60}
          className="min-w-0 flex-1 rounded-md border border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-white"
        />
        <button
          type="submit"
          disabled={!changed}
          className="flex-shrink-0 rounded-full bg-spotify-green px-5 py-2 text-sm font-bold text-on-accent transition hover:bg-spotify-green-bright disabled:opacity-40"
        >
          Save
        </button>
      </div>
      <p className="text-xs text-spotify-gray">Shown on your other devices, to play music here or control it from there.</p>
    </form>
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
    if (next.jamUrl && next.jamUrl !== previous.jamUrl) {
      const check = await checkJamServer();
      if (check === "unreachable") {
        setStatus({ kind: "warning", message: `Saved, but the Jam server at ${next.jamUrl} didn't respond, so Jam may not work.` });
        return;
      }
      if (check === "outdated") {
        setStatus({ kind: "warning", message: `Saved, but the Jam server at ${next.jamUrl} is too old for the mobile app: update it to the latest Docker image.` });
        return;
      }
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

/** The deemix server Discover downloads through. It's set on the Jam server, by Navidrome admins. */
function DiscoverSettings() {
  const config = useDiscoverConfig();
  const [url, setUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  if (!config) return <p className="text-sm text-spotify-gray">Loading...</p>;

  if (!config.canEdit) {
    return (
      <p className="text-sm text-spotify-gray">
        {config.available
          ? "Turn on Discover in Search to find music on Deezer and download it into your library."
          : "Discover finds music on Deezer and downloads it into your library. A Navidrome admin can set it up here."}
      </p>
    );
  }

  const value = url ?? config.url ?? "";
  const changed = value.trim().replace(/\/+$/, "") !== (config.url ?? "");

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const next = await setDiscoverUrl(value);
      setDiscoverConfig(next);
      setUrl(null);
      setStatus(
        next.persisted === false
          ? { kind: "warning", message: "Saved, but only until the server restarts: set DEEMIX_URL on it to keep it." }
          : { kind: "success", message: next.available ? "Saved. Discover is on." : "Saved. Discover is off." },
      );
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  const statusColor = { success: "text-spotify-green", warning: "text-yellow-500", error: "text-red-400" };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm font-semibold">
        <span>
          Deemix server <span className="font-normal text-spotify-gray">(admins only)</span>
        </span>
        <input
          type="url"
          value={value}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://deemix.example.com"
          className="rounded-md border border-white/20 bg-transparent px-3 py-3 text-sm font-normal outline-none focus:border-white"
        />
        <span className="text-xs font-normal text-spotify-gray">
          As the Spotifiak server reaches it (in Kubernetes, e.g. http://deemix.media.svc.cluster.local:6595). Its
          download folder must be Navidrome's music folder. Only the Spotifiak server talks to it: keep it out of
          reach of the internet, since deemix gives its Deezer login to anyone who asks. Leave empty to turn Discover off.
        </span>
      </label>
      {status && <p className={`text-sm ${statusColor[status.kind]}`}>{status.message}</p>}
      <button
        type="submit"
        disabled={!changed || saving}
        className="self-end rounded-full bg-spotify-green px-5 py-2 text-sm font-bold text-on-accent transition hover:bg-spotify-green-bright disabled:opacity-40"
      >
        Save
      </button>
    </form>
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
