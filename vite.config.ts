import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // In dev, proxy /rest (Subsonic API) and /cover (shortcut helper) straight to
  // your real Navidrome instance so the browser never hits CORS issues.
  // Override by setting VITE_DEV_NAVIDROME_URL in a local .env file.
  const navidromeTarget = env.VITE_DEV_NAVIDROME_URL || "https://navidrome.sachaguerin.fr";

  return {
    plugins: [react()],
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
      },
    },
  };
});
