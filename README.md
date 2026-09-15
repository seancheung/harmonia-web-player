# Harmonia Web Player

A responsive private music player using TypeScript, React 18, TanStack Router, Tailwind CSS 4, **react-motion**, Floating UI and Lucide. Biome handles formatting and linting; there is no ESLint or Prettier configuration.

This is a standalone repository. It has its own package manifest, lockfile, CI, Dockerfile and build output. Do not create a parent workspace or run it as a monorepo package.

Repository: [seancheung/harmonia-web-player](https://github.com/seancheung/harmonia-web-player). Server: [seancheung/harmonia-server](https://github.com/seancheung/harmonia-server).

## Development

Requirements: Node.js 22.12 or newer and a running Harmonia server.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://127.0.0.1:8090`. On first use, open **Settings**, add a server-side music folder and update the library.

To connect to another server, enter its URL and optional shared token in **Settings → Server connection**. Add the player's origin to the server's `HARMONIA_ORIGIN`. Use HTTPS for both services when deployed over HTTPS; browsers reject mixed-content audio requests.

## Build and checks

```sh
npm run check
npm test
npm run build
npm run preview
```

`npm run format` applies Biome fixes. Unit tests cover filter groups and numeric boundaries, exact folder matching, stable missing-last sorting, ReplayGain fallback/peak limiting, and lyric timestamps.

The lockfile pins installed versions. `.npmrc` enables legacy peer resolution because the requested `react-motion@0.5.2` package declares peer ranges predating React 18. Its `Motion` spring is used for dialogs; React's development build may report its legacy lifecycle warning. This is the requested package, not a substitution with Motion/Framer Motion.

## Deploy from GHCR

```sh
docker pull ghcr.io/seancheung/harmonia-web-player:latest
docker run -d --name harmonia-web-player --restart unless-stopped \
  -p 8080:80 ghcr.io/seancheung/harmonia-web-player:latest
```

Open `http://localhost:8080`, configure the server URL in Settings, and allow this origin on the server. The image serves static files with Nginx and falls back to `index.html` for TanStack Router deep links. It intentionally does not assume the backend repository, container name or deployment network. A same-origin `/api` reverse proxy can be added to `nginx.conf` for a particular deployment.

### Image tags and updates

The workflow publishes `ghcr.io/seancheung/harmonia-web-player` for Linux amd64 and arm64 after checks pass. Pushes to `main` update both `:main` and `:latest`; a stable release tag such as `v1.2.3` produces `:1.2.3` and also updates `:latest`. Prerelease tags do not update `:latest`. Use an existing version tag or digest for a pinned deployment. Images are available only after a successful publishing workflow.

To update, pull the chosen image and recreate the container with the same port mapping. The static player container needs no data volume: preferences remain in the browser, and library data resides on the server.

Public GHCR packages require no login. For private packages, run `docker login ghcr.io -u YOUR_GITHUB_USERNAME` and authenticate with a personal access token (classic) with `read:packages` scope. The repository owner must configure package visibility for public pulls. See the [GHCR authentication documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

For a source build, run `docker build -t harmonia-web-player .` and use `harmonia-web-player` instead of the GHCR image in the run command.

## Deploy both services with Docker Compose

Create a separate deployment directory containing the following `compose.yaml`. No source checkout or local image build is required.

```yaml
name: harmonia

services:
  server:
    image: ghcr.io/seancheung/harmonia-server:latest
    restart: unless-stopped
    ports:
      - "8090:8090"
    environment:
      HARMONIA_ORIGIN: "http://${HARMONIA_HOST:-localhost}:8080"
      HARMONIA_TOKEN: "${HARMONIA_TOKEN:-}"
    volumes:
      - data:/data
      - type: bind
        source: ${MUSIC_PATH:?Set MUSIC_PATH in .env}
        target: /music
        read_only: true
        bind:
          create_host_path: false

  web-player:
    image: ghcr.io/seancheung/harmonia-web-player:latest
    restart: unless-stopped
    ports:
      - "8080:80"

volumes:
  data:
```

Create a `.env` file beside it:

```dotenv
MUSIC_PATH=/absolute/path/to/music
HARMONIA_HOST=localhost
HARMONIA_TOKEN=
```

Use an existing absolute music directory. On Windows with Docker Desktop, use a path such as `MUSIC_PATH=D:/Music`. The server runs as UID/GID 10001 and needs read access to the mounted music. The named `data` volume holds library metadata, artwork and cache.

For access from another computer, replace `localhost` with the Docker host's LAN IP or hostname, such as `HARMONIA_HOST=192.168.1.20`. This value has no scheme or port. If authentication is desired, set a shared token and enter the same token in the player.

Start both containers:

```sh
docker compose pull
docker compose up -d
docker compose ps
```

1. Open `http://localhost:8080` (or `http://192.168.1.20:8080` for the LAN example).
2. In **Settings → Server connection**, set the server URL to `http://localhost:8090` (or `http://192.168.1.20:8090`) and save. Do not append `/api`.
3. Add `/music` as a source and run **Update library**.

The static player makes API requests from the browser, so the server address must be reachable from that browser. Do not enter `http://server:8090`: the Compose service name is only resolvable inside Docker. This example uses separate HTTP ports; HTTPS deployments need an HTTPS API or a same-origin reverse proxy.

To update both services:

```sh
docker compose pull
docker compose up -d
```

To stop them, run `docker compose down`. Keep the deployment directory and project name unchanged so the same data volume is reused. Do not add `--volumes` unless you intend to delete the stored library data. Existing deployments with a different data volume must explicitly reuse that volume; this example does not migrate it.

AirPlay additionally requires an OwnTone instance. Add `HARMONIA_OWNTONE` and `HARMONIA_PUBLIC_URL` under the server's environment; the public URL must be reachable from OwnTone, for example `http://192.168.1.20:8090`.

## Features

- Albums, artists, genres, songs, favorites, recent plays and source-relative folder navigation.
- Grid/list preferences, stable sorting, per-view 25/50/100 pagination, and full-result playback snapshots.
- Recursive all/any filter groups, full-text metadata comparisons and exact source/folder conditions.
- Ordinary and smart playlists, atomic batch additions, missing entries, cleanup and cross-page position moves.
- A persistent player with queue editing, random/repeat modes, progress, volume, lyrics and sleep timers.
- Browser Web Audio ReplayGain with album fallback, preamp and peak protection.
- Server conversion-rule selection and cache/source administration.
- OwnTone-backed device discovery, pairing, multiple AirPlay outputs and remote playback control.
- English/Simplified Chinese resources, light/dark/system themes and custom colors.

All Chinese source text lives in `src/i18n.ts`. Comments, identifiers and documentation use English.

## Playback details

Queue snapshots are separate from live smart-list results. Playing outside the queue replaces it; selecting within it preserves it. Missing entries remain identifiable but do not play. The default failure policy skips a failed track without trying alternate formats or repeatedly attempting it during the same queue run.

The queue panel uses TanStack Virtual with measured rows and scrolls to the current item when opened. Playback ticks do not rerender the memoized queue list. Queue snapshots are written only when their reference changes, separately from periodic progress updates; redundant lyrics and raw tags are excluded from stored snapshots. Existing combined snapshots are migrated on the next save. Storage failures do not interrupt playback. Remote polling retains the queue until its server version changes and prevents overlapping status requests.

Web Audio decodes the current track and preloads the next. Adjacent prepared tracks are scheduled on the same audio clock without trimming silence or crossfading. Files over 100 MiB use an HTML media stream instead; those transitions are not guaranteed sample-accurate. Unsupported browser formats must be handled by a selected server conversion rule; the player does not silently choose a different encoding. The server completes a conversion before serving the result, which can increase initial preparation time.

Only current/next playback buffers are held; there is no offline cache or service worker. Pause releases audio resources while retaining queue and position. Browser restoration starts paused. A still-playing remote output is synchronized from the server instead of overwritten by stale browser storage.

iPhone and iPad playback uses a reusable HTML audio element connected through the ReplayGain audio graph, including for smaller files. Pausing retains that element and its source for resuming. Where supported, the player requests an Audio Session of type `playback` and supplies Media Session metadata, artwork, position and transport handlers for system controls. This mobile path does not guarantee sample-accurate gapless transitions. Silent-switch behavior, lock-screen controls and background track advancement still require verification on the target iOS/Safari version.

Listening time is accumulated from actual audio advancement, excluding pauses and seeks. A new track or repeat cycle starts a new idempotent session. Lyric timestamps follow seeking; sidecar and embedded lyrics are provided by the server.

Sleep deadlines use wall-clock time, so pausing does not extend them. Finish-current-track takes priority over repeat, and manually choosing another track cancels an end-of-track timer. Browser sleep timers require the page to remain running; independent AirPlay timers are owned by the server.

## Project layout

```text
src/
  App.tsx          Routes, library views, playlist operations
  components.tsx   Shared controls, Floating UI dialogs/menus, filter editor
  context.tsx      Library fetching, preferences, localization context
  i18n.ts          English and Simplified Chinese resources
  model.ts         API types, filters, sorting, ReplayGain, lyric parsing
  player.ts        Audio engine, queue, timers, persistence, remote control
  player-ui.tsx    Transport, queue, lyrics, devices and sleep controls
  settings.tsx     Sources, conversion rules, cache and preferences
  styles.css      Responsive theme and layout
```

Library metadata is bootstrapped as a complete snapshot and grouped/paged in the browser. Sorting and filtering therefore cover all results before pagination; this approach trades simplicity for memory proportional to collection size. The server also exposes a paginated track-query API for future larger-library clients.

## Deployment validation

GitHub Actions runs `npm ci`, Biome, unit tests, production build and a Docker build entirely from this repository. CI uploads `dist` as an artifact. Pushes to `main` and `v*` tags also publish multi-platform images to `ghcr.io/seancheung/harmonia-web-player`; pull requests only build and test. Publishing an image does not deploy a running site.

Browser FLAC playback and the source/scan/browse flow can be checked against the server's Docker image without personal music. Physical AirPlay devices, PIN pairing, multiroom synchronization and transport-specific gapless playback require a configured OwnTone instance and actual target speakers. Unavailable devices are reported explicitly.


### Native multi-value tags

The server preserves repeated Vorbis Comment fields in native FLAC and Ogg Vorbis/Opus files, and null-separated ID3v2.4 text values in MP3 files. Values are exposed as arrays in `tagValues`; existing text fields remain available as semicolon-separated display values for compatible grouping, search and clients. Artist, album artist and genre values are split first at native boundaries, then at semicolons and any extra characters configured in server settings. A slash inside a native value is preserved unless `/` is configured.

The next ordinary library scan rereads metadata created by older versions once, preserving track IDs, favorites and play counts. Music files are not modified. Other tag formats continue to use ffprobe metadata; encrypted ID3 text frames or malformed native metadata produce a scan error and retain the previous library entry. Native metadata reads are bounded to 64 MiB.
