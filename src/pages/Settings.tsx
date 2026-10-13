import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";
import { CheckIcon, LogoutIcon } from "@/components/icons";
import { getServerConfig, serversConfigurable } from "@/lib/servers";
import { ACCENT_COLORS, resolveTheme, setTheme, THEMES, useTheme, type Theme } from "@/lib/theme";

const DEFAULT_THEME_IDS = ["dark", "light"];
const editorThemes = THEMES.filter((t) => !DEFAULT_THEME_IDS.includes(t.id));

export function Settings() {
  const { username, logout } = useAuth();
  const settings = useTheme();
  const theme = resolveTheme(settings.theme);
  // Desktop and mobile apps only: the server is chosen at login.
  const [server, setServer] = useState<string | null>(null);

  useEffect(() => {
    if (serversConfigurable) void getServerConfig().then((config) => setServer(config.navidromeUrl));
  }, []);

  return (
    <div className="mx-auto max-w-2xl pt-4 md:pt-6">
      <h1 className="mb-6 text-2xl font-bold sm:text-3xl">Settings</h1>

      <Section title="Account">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold">
            {username?.[0]?.toUpperCase() ?? "?"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{username}</p>
            {server && <p className="truncate text-sm text-spotify-gray">{server}</p>}
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

      <p className="pb-4 text-center text-xs text-spotify-gray">Spotifiak {__APP_VERSION__}</p>
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
