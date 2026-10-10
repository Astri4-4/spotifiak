# Spotifion

A Spotify-styled web client for a self-hosted [Navidrome](https://www.navidrome.org/) server, built with React + Vite + TypeScript + Tailwind, talking to Navidrome over the [Subsonic API](https://www.navidrome.org/docs/developers/subsonic-api/).

## How it's wired together

- **Frontend**: a single-page React app. The only custom backend is the small Jam server (below).
- **Auth**: you log in with your real Navidrome username/password. The app derives a Subsonic token-auth pair (salt + `md5(password + salt)`) client-side, verifies it with `ping`, and stores *that* (never the password) in `localStorage`. Each Navidrome user who logs in gets their own library, playlists, and scrobbles.
- **Talking to Navidrome**: in production, nginx (inside the Docker image) proxies every `/rest/*` request straight through to your real Navidrome server, configured via the `NAVIDROME_URL` environment variable. The browser only ever talks to this app's own origin, so there's no CORS configuration needed on Navidrome's end, and `NAVIDROME_URL` doesn't need to be reachable from the client's network - only from inside the container/your server.
- **Playback**: a single `<audio>` element streams directly from Navidrome's `/rest/stream` endpoint (letting Navidrome transcode if needed) and reports plays back via `/rest/scrobble`.

- **Jam** (listening together): `server/jam.mjs` is a dependency-free Node server that holds shared sessions - the queue, who's listening, and a playback clock. Clients follow it over Server-Sent Events and send actions with `POST`; every listener still streams the audio from Navidrome on their own device and re-syncs to the shared playhead. Requests are authenticated by checking the caller's Subsonic token against Navidrome's `ping`, so only users of your Navidrome server can start or join a Jam. Sessions live in memory: restarting the container ends any running Jams.

## Jam

Open **Jam** in the sidebar (or the tab bar on mobile) and start one, then share the invite link or 6-character code. Guests log in with their own account on the same Navidrome server.

- Everyone can add songs; playing something as a guest queues it for the group.
- Only the host controls playback (play/pause, skip, seek) unless they turn on *Let guests control playback*.
- The host can end the Jam for everyone; guests can leave at any time. A Jam nobody is connected to is cleaned up after 15 minutes.
- Listeners stay in sync to within a fraction of a second when Navidrome serves the original file. If Navidrome *transcodes* a track, the stream can't be seeked, so someone joining mid-song hears it from the start until the next track.

## Local development

```bash
npm install
npm run dev   # the app
npm run jam   # the Jam server, in a second terminal (only needed for Jam)
```

> This repo doesn't ship a `package-lock.json` yet (it was scaffolded without a local Node install) - the first `npm install` you run will create one. Please commit it, so CI and Docker builds become fully reproducible.

By default, `vite dev` proxies `/rest` to `https://navidrome.sachaguerin.fr`. To point it at a different server (e.g. a local test instance), create `.env.local`:

```
VITE_DEV_NAVIDROME_URL=http://localhost:4533
```

`/jam-api` is proxied to the Jam server on `http://127.0.0.1:3001` (override with `VITE_DEV_JAM_URL`). The Jam server validates logins against `NAVIDROME_URL` (default `https://navidrome.sachaguerin.fr`), so run it as `NAVIDROME_URL=http://localhost:4533 npm run jam` when using a different server.

## Running with Docker

```bash
cp .env.example .env   # set NAVIDROME_URL if it differs from the default
docker compose up -d --build
```

The app listens on `:8080` inside the container (mapped to `:8080` on the host by the default compose file). Put it behind whatever reverse proxy/TLS terminator you already use for your other self-hosted services (Traefik, Caddy, nginx-proxy, ...).

The image also runs the Jam server next to nginx (started by `docker/40-start-jam-server.sh`, proxied at `/jam-api/`) - no extra container or port needed.

`NAVIDROME_URL` must be reachable **from inside the container** - e.g. `http://navidrome:4533` if Navidrome is another container on the same Docker network, or `https://navidrome.sachaguerin.fr` if it's reachable that way from your host/network.

## Running on Kubernetes

Manifests live in `deploy/k8s/` (plain YAML + a kustomization):

```bash
# edit NAVIDROME_URL in deployment.yaml and the host in ingress.yaml first
kubectl apply -k deploy/k8s
```

Things worth knowing:

- **One replica only.** Jam sessions live in the Jam server's memory, so the Deployment runs `replicas: 1` with the `Recreate` strategy. Scaling out would put guests on pods that don't know the host's Jam. Redeploying or rescheduling the pod ends any running Jams.
- **Locked-down by default.** The image is based on `nginx-unprivileged` and runs as uid 101, so it passes the `restricted` Pod Security Standard (non-root, no capabilities, read-only root filesystem with `emptyDir`s for `/etc/nginx/conf.d`, `/tmp` and `/var/cache/nginx`).
- **Probes.** Readiness hits `/jam-api/healthz` (nginx + Jam server); liveness hits `/healthz` (nginx only - the Jam server is restarted inside the container if it crashes).
- **Ingress.** Jam's event stream is a long-lived Server-Sent Events connection. With ingress-nginx, keep the annotations from `ingress.yaml` (buffering off, 1h read timeout); other controllers need the equivalent settings, or Jam updates arrive late or the stream drops every minute.
- **Navidrome in the same cluster?** Point `NAVIDROME_URL` at its Service, e.g. `http://navidrome.media.svc.cluster.local:4533`.

## Desktop app (macOS / Windows / Linux)

The same app is also packaged as a desktop app with [Electron](https://www.electronjs.org/). Download the installer for your OS from the [GitHub Releases](../../releases) page:

| OS | File | Notes |
| --- | --- | --- |
| macOS | `Spotifiak-<version>-mac-arm64.dmg` (Apple Silicon) or `-mac-x64.dmg` (Intel) | Not notarized: the first time, right-click the app → **Open**, or allow it under **System Settings → Privacy & Security**. |
| Windows | `Spotifiak-<version>-win-x64.exe` | Not signed: SmartScreen may warn - **More info → Run anyway**. |
| Linux | `Spotifiak-<version>-linux-x86_64.AppImage` | `chmod +x` it, then run it. |

On the login screen, the desktop app also asks for:

- **Navidrome server** - the URL of your Navidrome instance (it must be reachable from your computer).
- **Jam server** (optional) - the URL of a Spotifiak web deployment (Docker/Kubernetes, see below). The desktop app uses that deployment's Jam server, so desktop and web users can join the same Jams. Leave it empty if you don't need Jam.

To change them later, log out. They're saved in `config.json` in the app's data directory (`~/Library/Application Support/Spotifiak`, `%APPDATA%\Spotifiak` or `~/.config/Spotifiak`).

How it works: `electron/main.mjs` starts a small HTTP server on `127.0.0.1` that does what nginx does in the Docker image - serves the built app from `dist/` and proxies `/rest` to Navidrome and `/jam-api` to the Jam server - so the React code runs unchanged.

```bash
npm run desktop        # build the web app and open it in Electron
npm run desktop:dist   # build installers for the current OS into release/
```

### Releasing

Push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

`.github/workflows/release.yml` then builds the macOS, Windows and Linux installers (the app version is taken from the tag) and publishes them as a GitHub Release with auto-generated release notes. Tags with a suffix (e.g. `v1.1.0-beta.1`) are marked as pre-releases. The Docker workflow also runs on the tag and pushes the matching image.

Builds are unsigned by default. To sign them, add these repository secrets and electron-builder will pick them up: `CSC_LINK` (base64 `.p12` certificate) and `CSC_KEY_PASSWORD`, plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` to notarize the macOS app.

## CI/CD

`.github/workflows/docker-build.yml` runs on every push:

1. **typecheck** - `npm ci && npm run build` (fails the build on TypeScript errors).
2. **docker** - builds the Docker image on every branch/PR as a smoke test. On pushes to `main` or version tags (`vX.Y.Z`), it also pushes the image to GitHub Container Registry as `ghcr.io/<owner>/<repo>` (tagged `latest`, the branch name, and/or the semver tag).

No extra secrets are required - it authenticates with the automatically-provided `GITHUB_TOKEN`. You may need to make the resulting package public (or configure `docker login` with a PAT on your server) the first time you pull it: **repo → Packages → spotifion → Package settings → Change visibility**.

## Branching

This repo follows a simple feature-branch workflow: work happens on `feature/*` (or similar) branches and gets merged into `main` via pull request. Every branch gets a CI build; `main` additionally gets published to GHCR as `:latest`.
