import { useSyncExternalStore } from "react";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

// The app's look: a color theme and an accent color, saved on this device.
// applyToDocument() writes the theme as CSS variables on <html> (used by
// tailwind.config.js) and caches them, so the inline script in index.html can
// restore them before first paint.

export type AccentColor = "green" | "blue" | "purple" | "pink" | "orange";

interface Palette {
  /** Text and icons. */
  fg: string;
  /** Deepest background (app frame, tab bar). */
  bg: string;
  /** Page background. */
  base: string;
  /** Cards. */
  elevated: string;
  /** Inputs, chips, the mini-player. */
  highlight: string;
  /** Pressed state. */
  press: string;
  /** Secondary text. */
  gray: string;
  /** Tertiary text and borders. */
  graySubdued: string;
}

export interface Theme {
  id: string;
  name: string;
  scheme: "dark" | "light";
  colors: Palette;
  /** The theme's own take on each accent; `label` when it's not that color (e.g. no pink in the palette). */
  accents: Record<AccentColor, { hex: string; label?: string }>;
}

export const THEMES: Theme[] = [
  {
    id: "dark",
    name: "Dark",
    scheme: "dark",
    colors: { fg: "#ffffff", bg: "#000000", base: "#121212", elevated: "#181818", highlight: "#282828", press: "#0a0a0a", gray: "#b3b3b3", graySubdued: "#6a6a6a" },
    accents: { green: { hex: "#1db954" }, blue: { hex: "#3b82f6" }, purple: { hex: "#8b5cf6" }, pink: { hex: "#ec4899" }, orange: { hex: "#f97316" } },
  },
  {
    id: "light",
    name: "Light",
    scheme: "light",
    colors: { fg: "#121212", bg: "#e2e2e6", base: "#f6f6f7", elevated: "#ffffff", highlight: "#e8e8eb", press: "#d6d6da", gray: "#626268", graySubdued: "#96969c" },
    accents: { green: { hex: "#1db954" }, blue: { hex: "#3b82f6" }, purple: { hex: "#8b5cf6" }, pink: { hex: "#ec4899" }, orange: { hex: "#f97316" } },
  },
  {
    id: "gruvbox-dark",
    name: "Gruvbox Dark",
    scheme: "dark",
    colors: { fg: "#ebdbb2", bg: "#1d2021", base: "#282828", elevated: "#32302f", highlight: "#3c3836", press: "#1d2021", gray: "#a89984", graySubdued: "#7c6f64" },
    accents: { green: { hex: "#b8bb26" }, blue: { hex: "#83a598" }, purple: { hex: "#d3869b" }, pink: { hex: "#fb4934", label: "Red" }, orange: { hex: "#fe8019" } },
  },
  {
    id: "gruvbox-light",
    name: "Gruvbox Light",
    scheme: "light",
    colors: { fg: "#3c3836", bg: "#ebdbb2", base: "#fbf1c7", elevated: "#f9f5d7", highlight: "#ebdbb2", press: "#d5c4a1", gray: "#7c6f64", graySubdued: "#a89984" },
    accents: { green: { hex: "#79740e" }, blue: { hex: "#076678" }, purple: { hex: "#8f3f71" }, pink: { hex: "#9d0006", label: "Red" }, orange: { hex: "#af3a03" } },
  },
  {
    id: "dracula",
    name: "Dracula",
    scheme: "dark",
    colors: { fg: "#f8f8f2", bg: "#191a21", base: "#282a36", elevated: "#2e303e", highlight: "#44475a", press: "#21222c", gray: "#b4b7cc", graySubdued: "#6272a4" },
    accents: { green: { hex: "#50fa7b" }, blue: { hex: "#8be9fd", label: "Cyan" }, purple: { hex: "#bd93f9" }, pink: { hex: "#ff79c6" }, orange: { hex: "#ffb86c" } },
  },
  {
    id: "nord",
    name: "Nord",
    scheme: "dark",
    colors: { fg: "#eceff4", bg: "#242933", base: "#2e3440", elevated: "#3b4252", highlight: "#434c5e", press: "#272c36", gray: "#b0b8c6", graySubdued: "#616e88" },
    accents: { green: { hex: "#a3be8c" }, blue: { hex: "#88c0d0" }, purple: { hex: "#b48ead" }, pink: { hex: "#bf616a", label: "Red" }, orange: { hex: "#d08770" } },
  },
  {
    id: "solarized-dark",
    name: "Solarized Dark",
    scheme: "dark",
    colors: { fg: "#eee8d5", bg: "#00212b", base: "#002b36", elevated: "#03303c", highlight: "#073642", press: "#001e26", gray: "#93a1a1", graySubdued: "#586e75" },
    accents: { green: { hex: "#859900" }, blue: { hex: "#268bd2" }, purple: { hex: "#6c71c4", label: "Violet" }, pink: { hex: "#d33682", label: "Magenta" }, orange: { hex: "#cb4b16" } },
  },
  {
    id: "solarized-light",
    name: "Solarized Light",
    scheme: "light",
    colors: { fg: "#073642", bg: "#eee8d5", base: "#fdf6e3", elevated: "#fffbee", highlight: "#eee8d5", press: "#e4ddc8", gray: "#586e75", graySubdued: "#93a1a1" },
    accents: { green: { hex: "#859900" }, blue: { hex: "#268bd2" }, purple: { hex: "#6c71c4", label: "Violet" }, pink: { hex: "#d33682", label: "Magenta" }, orange: { hex: "#cb4b16" } },
  },
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    scheme: "dark",
    colors: { fg: "#cdd6f4", bg: "#11111b", base: "#1e1e2e", elevated: "#252536", highlight: "#313244", press: "#181825", gray: "#a6adc8", graySubdued: "#6c7086" },
    accents: { green: { hex: "#a6e3a1" }, blue: { hex: "#89b4fa" }, purple: { hex: "#cba6f7", label: "Mauve" }, pink: { hex: "#f5c2e7" }, orange: { hex: "#fab387", label: "Peach" } },
  },
  {
    id: "catppuccin-latte",
    name: "Catppuccin Latte",
    scheme: "light",
    colors: { fg: "#4c4f69", bg: "#dce0e8", base: "#eff1f5", elevated: "#f8f9fb", highlight: "#e6e9ef", press: "#ccd0da", gray: "#6c6f85", graySubdued: "#9ca0b0" },
    accents: { green: { hex: "#40a02b" }, blue: { hex: "#1e66f5" }, purple: { hex: "#8839ef", label: "Mauve" }, pink: { hex: "#ea76cb" }, orange: { hex: "#fe640b", label: "Peach" } },
  },
  {
    id: "tokyo-night",
    name: "Tokyo Night",
    scheme: "dark",
    colors: { fg: "#c0caf5", bg: "#16161e", base: "#1a1b26", elevated: "#1f2335", highlight: "#292e42", press: "#13131a", gray: "#a9b1d6", graySubdued: "#565f89" },
    accents: { green: { hex: "#9ece6a" }, blue: { hex: "#7aa2f7" }, purple: { hex: "#bb9af7" }, pink: { hex: "#f7768e" }, orange: { hex: "#ff9e64" } },
  },
  {
    id: "one-dark",
    name: "One Dark",
    scheme: "dark",
    colors: { fg: "#dcdfe4", bg: "#1e2227", base: "#282c34", elevated: "#2c313a", highlight: "#3e4451", press: "#21252b", gray: "#abb2bf", graySubdued: "#5c6370" },
    accents: { green: { hex: "#98c379" }, blue: { hex: "#61afef" }, purple: { hex: "#c678dd" }, pink: { hex: "#e06c75", label: "Red" }, orange: { hex: "#d19a66" } },
  },
  {
    id: "monokai",
    name: "Monokai",
    scheme: "dark",
    colors: { fg: "#f8f8f2", bg: "#1e1f1c", base: "#272822", elevated: "#2d2e27", highlight: "#3e3d32", press: "#22231e", gray: "#cfcfc2", graySubdued: "#75715e" },
    accents: { green: { hex: "#a6e22e" }, blue: { hex: "#66d9ef" }, purple: { hex: "#ae81ff" }, pink: { hex: "#f92672" }, orange: { hex: "#fd971f" } },
  },
];

export const ACCENT_COLORS: { id: AccentColor; label: string }[] = [
  { id: "green", label: "Green" },
  { id: "blue", label: "Blue" },
  { id: "purple", label: "Purple" },
  { id: "pink", label: "Pink" },
  { id: "orange", label: "Orange" },
];

export interface ThemeSettings {
  /** A THEMES id, or "system" for Dark/Light following the device. */
  theme: string;
  accent: AccentColor;
}

const STORAGE_KEY = "spotifion.theme";
/** Resolved CSS variables of the last applied theme, for index.html's pre-paint script. */
const CACHE_KEY = "spotifion.theme.css";
const DEFAULT_SETTINGS: ThemeSettings = { theme: "dark", accent: "green" };
const systemLight = window.matchMedia("(prefers-color-scheme: light)");

function load(): ThemeSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let settings = load();
const listeners = new Set<() => void>();

/** The theme in effect: "system" resolves to Dark or Light; unknown ids fall back to Dark. */
export function resolveTheme(id: string): Theme {
  const resolved = id === "system" ? (systemLight.matches ? "light" : "dark") : id;
  return THEMES.find((t) => t.id === resolved) ?? THEMES[0];
}

// ---- color math -----------------------------------------------------------

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: RGB, b: RGB, amount: number): RGB {
  return a.map((v, i) => Math.round(v + (b[i] - v) * amount)) as RGB;
}

function luminance([r, g, b]: RGB): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const channels = (c: RGB) => c.join(" ");

/** The CSS variables (as "R G B" channels) for a theme and accent. */
function cssVariables(theme: Theme, accentId: AccentColor): Record<string, string> {
  const c = theme.colors;
  const accent = rgb(theme.accents[accentId].hex);
  // Hover state: a step toward the text color.
  const accentBright = mix(accent, rgb(c.fg), 0.15);
  // Text on the accent: the theme's own dark or light tone, whichever reads better.
  const tones = [rgb(c.fg), rgb(c.base)];
  const onAccent = contrast(tones[0], accent) >= contrast(tones[1], accent) ? tones[0] : tones[1];
  return {
    "--color-fg": channels(rgb(c.fg)),
    "--color-bg": channels(rgb(c.bg)),
    "--color-base": channels(rgb(c.base)),
    "--color-elevated": channels(rgb(c.elevated)),
    "--color-highlight": channels(rgb(c.highlight)),
    "--color-press": channels(rgb(c.press)),
    "--color-gray": channels(rgb(c.gray)),
    "--color-gray-subdued": channels(rgb(c.graySubdued)),
    "--color-accent": channels(accent),
    "--color-accent-bright": channels(accentBright),
    "--color-on-accent": channels(onAccent),
  };
}

// ---- applying ---------------------------------------------------------------

function applyToDocument() {
  const theme = resolveTheme(settings.theme);
  const vars = cssVariables(theme, settings.accent);
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  root.style.colorScheme = theme.scheme;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ scheme: theme.scheme, vars }));
  } catch {
    // Storage full or unavailable: only costs the pre-paint restore.
  }
  // Browser UI (e.g. Android Chrome's toolbar) matches the page background.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.colors.base);
  // Native apps: dark status bar icons on light themes, light ones on dark themes.
  if (Capacitor.isNativePlatform()) {
    SystemBars.setStyle({ style: theme.scheme === "light" ? SystemBarsStyle.Light : SystemBarsStyle.Dark }).catch(() => void 0);
  }
}

/** Applies the saved theme and follows the device in "system" mode. Call once at startup. */
export function initTheme() {
  applyToDocument();
  systemLight.addEventListener("change", () => {
    if (settings.theme === "system") applyToDocument();
  });
}

export function setTheme(change: Partial<ThemeSettings>) {
  settings = { ...settings, ...change };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applyToDocument();
  for (const l of listeners) l();
}

export function useTheme(): ThemeSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => settings,
  );
}
