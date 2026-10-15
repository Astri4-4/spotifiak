# Spotifion

A Spotify-styled web client for a self-hosted [Navidrome](https://www.navidrome.org/) server, built with React + Vite + TypeScript + Tailwind, talking to Navidrome over the [Subsonic API](https://www.navidrome.org/docs/developers/subsonic-api/).

## How it's wired together

- **Frontend**: a single-page React app. The only custom backend is the small Jam server (below).
- **Auth**: you log in with your real Navidrome username/password. The app derives a Subsonic token-auth pair (salt + `md5(password + salt)`) client-side, verifies it with `ping`, and stores *that* (never the password) in `localStorage`. Each Navidrome user who logs in gets their own library, playlists, and scrobbles.
- **Talking to Navidrome**: in production, nginx (inside the Docker image) proxies every `/rest/*` request straight through to your real Navidrome server, configured via the `NAVIDROME_URL` environment variable. The browser only ever talks to this app's own origin, so there's no CORS configuration needed on Navidrome's end, and `NAVIDROME_URL` doesn't need to be reachable from the client's network - only from inside the container/your server.
- **Playback**: a single `<audio>` element streams directly from Navidrome's `/rest/stream` endpoint (letting Navidrome transcode if needed) and reports plays back via `/rest/scrobble`.

- **Jam** (listening together): `server/jam.mjs` is a dependency-free Node server that holds shared sessions - the queue, who's listening, and a playback clock. Clients follow it over Server-Sent Events and send actions with `POST`; every listener still streams the audio from Navidrome on their own device and re-syncs to the shared playhead. Requests are authenticated by checking the caller's Subsonic token against Navidrome's `ping`, so only users of your Navidrome server can start or join a Jam. Sessions live in memory: restarting the container ends any running Jams.

## Devices (play on one, control from another)

Like Spotify Connect: every open app signed in to the same Navidrome account (desktop, phone, browser tab) is a device. The one playing music shows up on all the others, which can see what's playing and control it (play/pause, skip, seek, volume, shuffle/repeat), and picking a song anywhere plays it on that device. The speaker button in the player lists your devices: tap one to move playback there, picking up where it was. Only one device plays at a time; starting music on another one pauses the first.

- Devices go through the Jam server (`/jam-api/me/...` in `server/jam.mjs`), so it needs a Jam server: the web app always has one, the desktop and mobile apps use the one set in **Settings → Servers**.
- Each device is named after its platform ("Mac", "iPhone", "Chrome on Windows"); rename it in **Settings → Account**.
- A device in a Jam follows the Jam instead.
- Phones only show up while the app is open or playing (iOS and Android suspend it otherwise).

## Friend activity

See what the other people on your Navidrome server are listening to, like Spotify's Friend Activity: a panel on the right of wide windows, or the friends button in the top bar on smaller screens and phones. Each entry shows the song (play it yourself with its cover), and a green dot while they're probably still listening.

It uses Navidrome's own "now playing" list (Subsonic `getNowPlaying`), so it needs no extra server and also shows people using other Navidrome apps. To stop appearing in it, turn off **Settings → Privacy → Share what I'm listening to**: the app then stops sending "now playing" (your plays are still saved to your history). Other apps you use have their own behaviour.

### This week (scoreboard)

The **This week** tab of Friend activity ranks who listened the most since Monday (by listening time, with each person's top artists), and lists the artists at least two of you listened to this week. Weeks start on Monday at midnight in the server's time zone (set `TZ` on the container to change it).

It's kept by the Jam server (`server/scoreboard.mjs`): the app reports each song once it's half played, at the same time as it scrobbles it, and the server looks it up in Navidrome with your credentials so only real songs count, at their real length. So only plays from Spotifiak count, and only while **Share what I'm listening to** is on; turning it off also takes you off this week's board. The board is saved in `JAM_DATA_DIR` (a volume in `docker-compose.yml`); without a writable one, as on the Kubernetes deployment, it starts over when the server restarts.

## Discover (download new music)

Turn on **Discover** in Search to search Deezer instead of your library: listen to 30-second previews and download songs or whole albums into your library, through your [deemix](https://github.com/bambanah/deemix) server. Downloads show their progress, and appear in your library once Navidrome has picked them up (the app asks Navidrome to rescan when it can - admins only - otherwise Navidrome's own file watcher or scheduled scan finds them).

- deemix must download into Navidrome's music folder, and be logged in to Deezer (its single-user mode, which keeps the ARL; or set `DEEMIX_ARL` on the Spotifiak server).
- The Spotifiak server is the gateway: `server/discover.mjs`, in the Jam server, is the only thing that talks to deemix. Apps only get search results, "download this" and download progress, and only for signed-in Navidrome users. deemix's API hands its Deezer login to anyone who asks and has no accounts of its own, so keep deemix itself out of reach of the internet.
- Set the deemix server with `DEEMIX_URL` on the Spotifiak server, or from **Settings → Discover** (Navidrome admins only; saved in `JAM_DATA_DIR`, `/opt/jam/data` in the Docker image - mount a volume there to keep it). Leave it empty to turn Discover off.
- The desktop and mobile apps use the Discover of their Jam server.

## Podcasts

**Podcasts** (in the sidebar, or Your Library on phones): search the Apple Podcasts directory or paste a show's RSS link, follow shows, and see their new episodes. Episodes play in the same player and queue as songs, with 15 s back / 30 s forward buttons and a playback speed (0.8× to 2×, remembered on each device), and pick up where you left them, on any device. Near the end counts as played; "Mark as played" in an episode's menu does it by hand.

- Navidrome has no podcast support (its Subsonic podcast endpoints answer "not implemented"), so the Jam server does it: `server/podcasts.mjs` reads the shows' public RSS feeds (cached for 15 minutes) and keeps each person's shows and listening progress in `JAM_DATA_DIR/podcasts.json` (lost on restart without a writable one, like Mixes). Nothing goes into the music library, and episodes aren't scrobbled.
- Apps stream episodes straight from the publisher, like any podcast app, so it's free and needs no account; shows only on Spotify, or paid ones, have no public feed (a private feed link, e.g. from Patreon, works).
- The server fetches the feed links people give it, so it refuses addresses on private networks; set `PODCASTS_ALLOW_PRIVATE=1` to allow feeds hosted on your own network.
- Episodes work in a Jam and across devices too. In a Jam they play at normal speed, to stay in sync.

## Calendar

**Calendar** (in the sidebar, or Your Library on phones): new releases and concerts of the artists you follow. Follow an artist from their page, or from your most played ones on the calendar page; see it as a list or a month, only releases or concerts, and concerts only in your country. Events found since you last looked are marked new, with their count in the sidebar. "Add to your calendar" gives a private link to subscribe to from Google Calendar, Apple Calendar or Outlook.

- Releases come from [MusicBrainz](https://musicbrainz.org) (free, no key): announced albums often show up there before they're out, and the last 60 days' stay as "recently released". Artists are matched by the MusicBrainz id in your files' tags, or else by name.
- Concerts come from Ticketmaster's [Discovery API](https://developer.ticketmaster.com) (free, 5000 requests a day): a Navidrome admin adds the key in **Settings → Calendar**, or set `TICKETMASTER_API_KEY` on the Spotifiak server. Small venues and festivals not sold there are missing.
- The Jam server does the lookups (`server/events.mjs`), in the background: each artist at most once a day for releases and twice a day for concerts, shared by everyone following them. It keeps everything in `JAM_DATA_DIR/events.json` (lost on restart without a writable one).
- The calendar link works without logging in (calendar apps can't), so anyone who has it sees that calendar; "Make a new link" stops the old one working.

## Library

- **Artist pages** show their popular songs, albums apart from singles and EPs, a biography and similar artists in the library. Popular songs, the biography and similar artists come from Last.fm through Navidrome (`getTopSongs`, `getArtistInfo2`), so they need Last.fm set up there (`ND_LASTFM_APIKEY`/`ND_LASTFM_SECRET`); without it, the page shows the artist's songs you play the most instead.
- **Sort and search**: Your Library (playlists, artists, every album), a playlist and Liked Songs can be searched and sorted (title, artist, album, duration, plays, recently added or played...). The sort is remembered on each device.
- **Select several songs**: "Select" in a song's menu, or Ctrl/Cmd-click and Shift-click, then play, queue, like, add to a playlist or remove them from yours at once.
- **Smart playlists**, worked out from your own listening each time they're opened (Navidrome keeps play counts per person): On Repeat (most played), Recently Played, Fresh in the Library (newest albums), Liked, Never Played and Forgotten Likes (not played in 3 months). Any of them can be saved as a regular playlist.

## Hide duplicates

Albums, artists and playlists have a **Hide duplicates** button, for when the library has the same song several times (an album's track and its single, a compilation, a downloaded playlist's folder). It finds the other copies of their songs (same title and artist, about the same length), keeps the best one - an album's track over a single, then the highest bitrate - and hides the others, after showing what it would hide.

- It's only for you, and nothing changes in the library: no file is moved and no playlist is edited, so nothing breaks for anyone. A hidden copy disappears wherever the copy kept is listed too (or another copy of it already is), so lists, search and liked songs show the song once, while a playlist with only that copy still plays it. Albums left with only hidden copies (usually singles) disappear from artist pages and search.
- Show them again from the same button ("Show again"), or all at once in **Settings → Library**.
- The Jam server keeps the list (`server/hidden.mjs`), so it follows you on every device. It's saved in `JAM_DATA_DIR/hidden.json` (lost on restart without a writable one, like Mixes).

## Jam

Open **Jam** in the sidebar (or the tab bar on mobile) and start one, then share the invite link or 6-character code. Guests log in with their own account on the same Navidrome server.

- Everyone can add songs; playing something as a guest queues it for the group.
- Only the host controls playback (play/pause, skip, seek) unless they turn on *Let guests control playback*.
- The host can end the Jam for everyone; guests can leave at any time. A Jam nobody is connected to is cleaned up after 15 minutes.
- Listeners stay in sync to within a fraction of a second when Navidrome serves the original file. If Navidrome *transcodes* a track, the stream can't be seeked, so someone joining mid-song hears it from the start until the next track.

## Mixes

A mix blends a few people's most played songs into one playlist, like Spotify's Blend. Open **Mixes** in the sidebar (or **Your Library** on mobile), make one and share the invite link or code.

- Navidrome only shows play counts to their owner, so each member's app works out their own top 50 songs (from their most played albums, topped up with liked songs) and sends them to the Jam server (`server/mixes.mjs`). Joining a mix is agreeing to share them with its members; others with the code only see who's in it.
- Songs several members play open the mix, then everyone's songs take turns, up to 100. Your songs are refreshed when you open the mix, at most once a day.
- The creator can also save it as a public Navidrome playlist, which everyone on the server can play from any Subsonic app. It's updated when they open the mix.
- Mixes are saved in `JAM_DATA_DIR` (`/opt/jam/data` in the Docker image - mount a volume there to keep them). Without a writable one, they're lost when the server restarts.

## Profile pictures

Set yours in **Settings → Account**. The app crops the middle square of the picture, shrinks it to a 256px JPEG and uploads it to the Jam server (`server/avatars.mjs`), since Navidrome's API can't store one. It shows next to your name in the top bar, Jam and Friend activity; people without one get their initial. Pictures are saved in `JAM_DATA_DIR/avatars` (lost on restart without a writable one, like Mixes).

## Invites

Invite people to your Jam or a mix from inside the app: the Jam panel and a mix's page list everyone on the server, and **Invite** puts it in their inbox (the bell in the top bar, which pops up when something arrives). **Join** opens the Jam or the mix to join it, **Decline** removes it. The invite link and code still work for anyone else.

- The Jam server (`server/invites.mjs`) carries them. Navidrome only lists its users to admins, so the people you can invite are everyone who has used an app with this server.
- Anyone in a Jam or a mix can invite people to it. Invites go away once they're answered, the person joins, the Jam ends or the mix is deleted, or after a week.
- Invites are saved in `JAM_DATA_DIR/invites.json` (lost on restart without a writable one, like Mixes). Apps check for new ones every 20 seconds while open.

## Local development

```bash
npm install
npm run dev   # the app
npm run jam   # the Jam server, in a second terminal (only needed for Jam)
```

> This repo doesn't ship a `package-lock.json` yet (it was scaffolded without a local Node install) - the first `npm install` you run will create one. Please commit it, so CI and Docker builds become fully reproducible.

### Testing on your phone

`npm run dev` also serves the app on your local network and prints a QR code: scan it with your phone's camera (phone on the same Wi-Fi as the computer) to open the app in the phone's browser, with live reload as you edit. It's the quickest way to check the mobile layout. Run `npm run jam` too if you want to try Jam. If the page doesn't load, allow incoming connections for Node in your computer's firewall.

Native-only behaviour (background playback, lock-screen controls, the status bar) still needs the real app from a release build, see [Mobile app](#mobile-app-ios--android).

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
- **Saved data.** Mixes and the deemix server set in Settings are kept in `JAM_DATA_DIR` (`/opt/jam/data`), on a small `ReadWriteOnce` volume from the default StorageClass (`data-volume.yaml`). The pod's `fsGroup: 101` makes it writable for the app; CSI drivers that apply fsGroup to every volume would also re-own the music share, which the SMB driver doesn't (it only applies it to `ReadWriteOnce` volumes).
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

To change them later, open **Settings** (the profile icon, top right) → **Servers**. They're saved in `config.json` in the app's data directory (`~/Library/Application Support/Spotifiak`, `%APPDATA%\Spotifiak` or `~/.config/Spotifiak`).

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

`.github/workflows/release.yml` then builds the macOS, Windows and Linux installers, the Android APK and iOS IPA, and the live-update bundle (the app version is taken from the tag) and publishes them as a GitHub Release with auto-generated release notes. Tags with a suffix (e.g. `v1.1.0-beta.1`) are marked as pre-releases. To check the builds without releasing anything, run the workflow by hand from **Actions → Release → Run workflow** on any branch; the files are then attached to the run as artifacts. The Docker workflow also runs on the tag and pushes the matching image.

Builds are unsigned by default. To sign them, add these repository secrets and electron-builder will pick them up: `CSC_LINK` (base64 `.p12` certificate) and `CSC_KEY_PASSWORD`, plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` to notarize the macOS app.

## Mobile app (iOS / Android)

The app is also wrapped for phones with [Capacitor](https://capacitorjs.com/) (`capacitor.config.ts`, native projects in `android/` and `ios/`). Each GitHub Release includes:

- **Android** - `Spotifiak-<version>-android.apk`. Open it on your phone and allow installing from that source.
- **iOS** - `Spotifiak-<version>-ios.ipa`, unsigned. Install it with [SideStore](https://sidestore.io/), [AltStore](https://altstore.io/) or [Sideloadly](https://sideloadly.io/) using your Apple ID. With a free Apple ID the app has to be re-signed every 7 days; SideStore/AltStore can do that automatically in the background.

As in the desktop app, the login screen asks for the **Navidrome server** and an optional **Jam server** (the URL of a Spotifiak web deployment), which you can change later in **Settings → Servers**. Both must be reachable from the phone, as there's no proxy in between: API calls go through the phone's native HTTP stack (so Navidrome needs no CORS setup), and the Jam server answers cross-origin requests itself, so the web deployment has to run a version of the Docker image that includes that.

Music keeps playing with the screen locked or the app in the background, with controls on the lock screen and in the notification shade (`@capgo/capacitor-media-session`; on Android it runs a media-playback foreground service while music plays). The same Media Session integration gives the web and desktop apps media-key support.

Building locally needs Android Studio (Android) or Xcode (iOS):

```bash
npm run build && npx cap sync   # copy the web build into both native projects
npx cap open android            # or: npx cap open ios
```

### Android signing

Without a signing key, CI signs each APK with a new throwaway key, so Android refuses to install a new version over an old one (uninstall first, which logs you out). To make updates install normally, create a key once and add it as repository secrets:

```bash
keytool -genkeypair -v -keystore spotifiak.keystore -alias spotifiak -keyalg RSA -keysize 4096 -validity 10000
base64 -i spotifiak.keystore | pbcopy   # paste as ANDROID_KEYSTORE_BASE64
```

plus `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`spotifiak`) and `ANDROID_KEY_PASSWORD`. Keep the keystore file safe: losing it means users have to reinstall.

## Live updates (desktop and mobile)

The desktop and mobile apps update their app code on their own, without reinstalling (or re-signing on iOS). Each release also carries the built web app (`spotifiak-web-<version>.zip`) and an `update.json`; a few seconds after launch the apps check the repo's latest release on GitHub, download a newer bundle in the background, and use it from the next launch (or right away with **Settings → Updates → Restart now**).

- **Beta versions**: **Settings → Updates → Get beta versions** also offers pre-releases (tags with a `-`, like `v0.7.0-beta.1`, which the release workflow publishes as pre-releases): the newest release by version, stable or not. Turning it off never downgrades; the next stable release takes over. Desktop installs from before this setting need a new install to get it.

- **Desktop** (`electron/updates.mjs`): bundles go to the app's data directory (`updates/`) and the local server serves them instead of the bundled `dist/`.
- **Android / iOS** (`src/lib/updates.ts`): [`@capgo/capacitor-updater`](https://github.com/Cap-go/capacitor-updater) in manual mode. All of Capgo's cloud endpoints (update checks, channels, statistics) are turned off in `capacitor.config.ts`; the app only talks to GitHub.
- **Safety net**: a new bundle has to report that it started. If it doesn't (within 15 s on desktop, 10 s on mobile), the app goes back to the last version that worked and never retries that one.
- **Requirement**: the repo's releases must be publicly downloadable (a public repo).

Live updates only cover the web app. When a release changes native or Electron code (a new Capacitor plugin, `electron/`, `Info.plist`, `AndroidManifest.xml`, ...), set `updates.minShellVersion` in `package.json` to that release's version: older installs then skip the bundle and say a new install is needed, instead of loading code their shell can't run.

To test the desktop flow against a fake GitHub API, start the app with `SPOTIFIAK_UPDATES_API=http://127.0.0.1:<port>`.

## CI/CD

`.github/workflows/docker-build.yml` runs on every push:

1. **typecheck** - `npm ci && npm run build` (fails the build on TypeScript errors).
2. **docker** - builds the Docker image on every branch/PR as a smoke test. On pushes to `main` or version tags (`vX.Y.Z`), it also pushes the image to GitHub Container Registry as `ghcr.io/<owner>/<repo>` (tagged `latest`, the branch name, and/or the semver tag).

No extra secrets are required - it authenticates with the automatically-provided `GITHUB_TOKEN`. You may need to make the resulting package public (or configure `docker login` with a PAT on your server) the first time you pull it: **repo → Packages → spotifion → Package settings → Change visibility**.

## Branching

This repo follows a simple feature-branch workflow: work happens on `feature/*` (or similar) branches and gets merged into `main` via pull request. Every branch gets a CI build; `main` additionally gets published to GHCR as `:latest`.
