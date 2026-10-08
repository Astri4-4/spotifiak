# Spotifion

A Spotify-styled web client for a self-hosted [Navidrome](https://www.navidrome.org/) server, built with React + Vite + TypeScript + Tailwind, talking to Navidrome over the [Subsonic API](https://www.navidrome.org/docs/developers/subsonic-api/).

## How it's wired together

- **Frontend**: a single-page React app. There's no custom backend of its own.
- **Auth**: you log in with your real Navidrome username/password. The app derives a Subsonic token-auth pair (salt + `md5(password + salt)`) client-side, verifies it with `ping`, and stores *that* (never the password) in `localStorage`. Each Navidrome user who logs in gets their own library, playlists, and scrobbles.
- **Talking to Navidrome**: in production, nginx (inside the Docker image) proxies every `/rest/*` request straight through to your real Navidrome server, configured via the `NAVIDROME_URL` environment variable. The browser only ever talks to this app's own origin, so there's no CORS configuration needed on Navidrome's end, and `NAVIDROME_URL` doesn't need to be reachable from the client's network - only from inside the container/your server.
- **Playback**: a single `<audio>` element streams directly from Navidrome's `/rest/stream` endpoint (letting Navidrome transcode if needed) and reports plays back via `/rest/scrobble`.

## Local development

```bash
npm install
npm run dev
```

> This repo doesn't ship a `package-lock.json` yet (it was scaffolded without a local Node install) - the first `npm install` you run will create one. Please commit it, so CI and Docker builds become fully reproducible.

By default, `vite dev` proxies `/rest` to `https://navidrome.sachaguerin.fr`. To point it at a different server (e.g. a local test instance), create `.env.local`:

```
VITE_DEV_NAVIDROME_URL=http://localhost:4533
```

## Running with Docker

```bash
cp .env.example .env   # set NAVIDROME_URL if it differs from the default
docker compose up -d --build
```

The app listens on `:8080` inside the container (mapped to `:8080` on the host by the default compose file). Put it behind whatever reverse proxy/TLS terminator you already use for your other self-hosted services (Traefik, Caddy, nginx-proxy, ...).

`NAVIDROME_URL` must be reachable **from inside the container** - e.g. `http://navidrome:4533` if Navidrome is another container on the same Docker network, or `https://navidrome.sachaguerin.fr` if it's reachable that way from your host/network.

## CI/CD

`.github/workflows/docker-build.yml` runs on every push:

1. **typecheck** - `npm ci && npm run build` (fails the build on TypeScript errors).
2. **docker** - builds the Docker image on every branch/PR as a smoke test. On pushes to `main` or version tags (`vX.Y.Z`), it also pushes the image to GitHub Container Registry as `ghcr.io/<owner>/<repo>` (tagged `latest`, the branch name, and/or the semver tag).

No extra secrets are required - it authenticates with the automatically-provided `GITHUB_TOKEN`. You may need to make the resulting package public (or configure `docker login` with a PAT on your server) the first time you pull it: **repo → Packages → spotifion → Package settings → Change visibility**.

## Branching

This repo follows a simple feature-branch workflow: work happens on `feature/*` (or similar) branches and gets merged into `main` via pull request. Every branch gets a CI build; `main` additionally gets published to GHCR as `:latest`.
