import type { CapacitorConfig } from "@capacitor/cli";

// Mobile (iOS/Android) shell around the built web app in dist/. Unlike the
// Docker image and the desktop app there's no proxy here: the app calls
// Navidrome and the Jam server by their full URLs (see src/lib/servers.ts).
const config: CapacitorConfig = {
  appId: "fr.sachaguerin.spotifiak",
  appName: "Spotifiak",
  webDir: "dist",
  backgroundColor: "#000000",
  plugins: {
    // Routes fetch() through the native HTTP stack, so Subsonic and Jam API
    // calls aren't subject to CORS (Navidrome doesn't send CORS headers).
    CapacitorHttp: { enabled: true },
    // Light status/navigation bar icons on the dark UI. The app draws under
    // the bars (viewport-fit=cover) and pads itself with the safe-area insets.
    SystemBars: { style: "DARK", initialViewportFitValueHint: "cover" },
    // Live updates (src/lib/updates.ts) in manual mode: the app decides what
    // to download from GitHub Releases. The empty URLs turn off every call to
    // Capgo's cloud, including usage and crash statistics.
    CapacitorUpdater: {
      autoUpdate: false,
      updateUrl: "",
      statsUrl: "",
      channelUrl: "",
    },
  },
  android: {
    // The app is served from https://localhost; let it play audio and load
    // covers from a Navidrome server that only speaks http://.
    allowMixedContent: true,
  },
};

export default config;
