import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";
import qrcode from "qrcode-terminal";

/**
 * Prints a QR code of the dev server's network URL, so you can open the app
 * on a phone on the same Wi-Fi by scanning it with the camera.
 */
function phoneQrCode(): Plugin {
  return {
    name: "phone-qr-code",
    apply: "serve",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        // After Vite's own banner, which is printed once listening.
        setTimeout(() => {
          const url = server.resolvedUrls?.network[0];
          if (!url) return;
          qrcode.generate(url, { small: true }, (code: string) => {
            server.config.logger.info(`\n  Scan to open on your phone (same Wi-Fi as this computer):\n\n${code}`);
          });
        }, 100);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  // In dev, proxy /rest (Subsonic API) and /cover (shortcut helper) straight to
  // your real Navidrome instance so the browser never hits CORS issues.
  // Override by setting VITE_DEV_NAVIDROME_URL in a local .env file.
  const navidromeTarget = env.VITE_DEV_NAVIDROME_URL || "https://navidrome.sachaguerin.fr";
  // The Jam server (server/jam.mjs) - start it with `npm run jam`.
  const jamTarget = env.VITE_DEV_JAM_URL || "http://127.0.0.1:3001";

  return {
    plugins: [react(), phoneQrCode()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __UPDATE_REPO__: JSON.stringify(pkg.updates.github),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/rest": {
          target: navidromeTarget,
          changeOrigin: true,
        },
        "/jam-api": {
          target: jamTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
