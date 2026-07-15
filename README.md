# Clone Hero Chart Analyzer

A web app that calculates the theoretical **maximum possible score** for any [Clone Hero](https://clonehero.net/) chart (`.chart` or `.mid`), including the optimal Star Power activation path — visualized on an interactive note highway.

Available in **English** and **German**, switchable via the flag toggle in the app header.

## Features

- Parses both `.chart` (text) and `.mid` (binary Standard MIDI File) chart formats
- Calculates the theoretical max score: 100% Full Combo, 100% solo accuracy, and a provably optimal Star Power path
- Dynamic-programming Star Power optimizer that tests every banking/activation combination under the real single-gauge drain/gain model (including "early whammy")
- Interactive SVG highway with notes, sustains, HOPO/Tap/Open markers, SP phrases, and the calculated optimal activation windows — hover anywhere to see the running score at that point in the song
- Reads `song.ini` metadata and album art; supports dropping a zipped song folder directly
- No backend, no data collection — everything runs client-side in the browser

## How it works

- **Parsers** (`src/parsers/`): custom implementations for `.chart` (text) and `.mid` (binary Standard MIDI File), following the [GuitarGame_ChartFormats documentation](https://thenathannator.github.io/GuitarGame_ChartFormats/).
- **Score engine** (`src/scoring/score.ts`): 50 points/note, discrete sustain ticks, 1x–4x multiplier tiers (every 10-note combo streak), solo bonus, clean-play bonus — values cross-checked against the [Clone Hero Wiki](https://wiki.clonehero.net/books/general-info/page/dictionary) and verified against actual in-game score gains.
- **Star Power optimizer** (`src/scoring/optimizer.ts`): dynamic programming over every SP phrase to find the banking/activation combination that maximizes the score bonus. The gauge mechanic (25%/phrase, 1/30 of the gauge per quarter-note of whammy, a full gauge draining over exactly 8 measures) follows the model used by [CHOpt](https://github.com/GenericMadScientist/CHOpt), the open-source SP path optimizer the Clone Hero community uses to verify leaderboard runs — simplified by not simulating note-level timing-squeeze techniques.
- **Visualization** (`src/components/Highway.tsx`): SVG highway rendering notes, sustains, SP phrases, and the calculated optimal activation windows.

All assumptions and simplifications are documented in-app under "Assumptions & Scoring Methodology" (bottom of the page).

## Getting started

```bash
npm install
npm run dev
```

Then drop `notes.chart`, `notes.mid`, or a zipped song folder onto the page (optionally together with `song.ini` and album art).

## Testing the parser/scoring logic without the UI

```bash
npx tsx scripts/testParse.ts
```

## Deployment via Docker

### Option A: volume-mount (no custom image build)

`server.js` only uses Node built-ins (`node:http`, `node:fs`, `node:path`, `node:url`) — no runtime npm dependencies. That means a stock `node:22-alpine` image is enough; the app is simply mounted as a volume, no custom image build required.

**1. Copy the app folder to the server** (e.g. to `/srv/ch-chart-analyzer`), then build inside it:

```bash
cd /srv/ch-chart-analyzer

# Build in a throwaway container (no Node needed on the host):
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":/app -w /app node:22-alpine sh -c "npm ci && npm run build"
```

This produces `dist/` in the same folder. Re-run the build command for every new version.

**2. Start the container** — mounts the folder as a volume and runs `server.js` directly:

```bash
docker run -d \
  --name ch-chart-analyzer \
  -p 8080:3000 \
  -v "$PWD":/app \
  -w /app \
  -e PORT=3000 \
  --restart unless-stopped \
  node:22-alpine node server.js
```

The app is then reachable at `http://<server-ip>:8080`.

**Updating to a new version** (the container needs a restart to pick up the newly built files in the volume):

```bash
cd /srv/ch-chart-analyzer
git pull   # or upload new files
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":/app -w /app node:22-alpine sh -c "npm ci && npm run build"
docker restart ch-chart-analyzer
```

### Option B: standalone image

For a self-contained deployment (no build step on the server, a single artifact), a `Dockerfile` is included that bundles the build and runtime into one image:

```bash
docker build -t ch-chart-analyzer .
docker run -d --name ch-chart-analyzer -p 8080:3000 --restart unless-stopped ch-chart-analyzer
```

## Tech stack

React 19, TypeScript, Vite. No backend, no database, no analytics — the app is a static SPA; `server.js` is a dependency-free static file server for self-hosting.

## Acknowledgments

- [CHOpt](https://github.com/GenericMadScientist/CHOpt) and its [SightRead](https://github.com/CraigMSmith/SightRead) parser library — used as the authoritative reference for scoring and Star Power mechanics
- [Clone Hero Wiki](https://wiki.clonehero.net/) — scoring dictionary and format documentation
- [GuitarGame_ChartFormats](https://thenathannator.github.io/GuitarGame_ChartFormats/) — `.chart`/`.mid` format reference

## License

[GPL-3.0](LICENSE)
