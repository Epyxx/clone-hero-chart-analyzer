# Clone Hero Chart Analyzer

A web app that calculates the theoretical **maximum possible score** for any [Clone Hero](https://clonehero.net/) chart (`.chart` or `.mid`), including the optimal Star Power activation path — visualized on an interactive note highway.

Available in **English** and **German**, switchable via the flag toggle in the app header.

## Features

- Parses both `.chart` (text) and `.mid` (binary Standard MIDI File) chart formats
- Calculates the theoretical max score: 100% Full Combo, 100% solo accuracy, and a provably optimal Star Power path — for every 5-fret/6-fret instrument and difficulty, plus a best-effort estimate for Drums/Pro Drums from both `.chart` and `.mid` files, checked against real leaderboard score breakdowns but not byte-exact verified the way everything else is (see the in-app caveat)
- Dynamic-programming Star Power optimizer that tests every banking/activation combination under the real single-gauge drain/gain model (including "early whammy")
- Interactive SVG highway with notes, sustains, HOPO/Tap/Open markers, SP phrases, and the calculated optimal activation windows — hover anywhere to see the running score at that point in the song. Drums get a dedicated highway (`src/components/DrumHighway.tsx`) showing kick, cymbal-vs-tom, ghost/accent dynamics, and double-kick.
- Reads `song.ini` metadata and album art; supports dropping a zipped song folder directly
- Instrument/difficulty selectors match `leaderboards.clonehero.net`'s own ordering (Lead Guitar, Bass, ..., Drums, Pro Drums); Drums/Pro Drums additionally get a Modifier selector (`None`/`Double Kick`/`No Kick`) for the two Clone Hero score modifiers confirmed to change the scored note set, with the max score recalculated accordingly
- Links directly to the chart's page on `leaderboards.clonehero.net` by reconstructing the same hash the game itself uses to identify a chart (requires `song.ini`; see [How it works](#how-it-works)) — the link follows the selected instrument, difficulty, and modifier
- No backend, no data collection — everything runs client-side in the browser

## How it works

- **Parsers** (`src/parsers/`): custom implementations for `.chart` (text) and `.mid` (binary Standard MIDI File), following the [GuitarGame_ChartFormats documentation](https://thenathannator.github.io/GuitarGame_ChartFormats/).
- **Score engine** (`src/scoring/score.ts`): 50 points/note, discrete sustain ticks, 1x–4x multiplier tiers (every 10-note combo streak), solo bonus, clean-play bonus — values cross-checked against the [Clone Hero Wiki](https://wiki.clonehero.net/books/general-info/page/dictionary) and verified against actual in-game score gains. Drums (`src/scoring/drumAdapter.ts`) reuse this same engine via an adapter — kick/snare/tom hits are 50 points (same as guitar; an initial guess of 25, half of guitar's value, was revised after a real #1 leaderboard score for a Pro Drums chart came in *higher* than that estimate allowed, which can't happen for a true maximum), **cymbal hits are 65 points**, and **ghost/accent notes hit with the correct dynamic score an extra flat, unmultiplied 50 points each** — both found by pulling real scores' own point breakdowns directly from Clone Hero's public score API (`noteScore`/`comboScore`/`spScore`/`ghostsHit`/`accentsHit` as separate fields, far more precise than the website UI): a real #1 score's exact `noteScore` value only balances at 50/65 points for non-cymbal/cymbal hits to the exact point, and 5 of 6 real scores with nonzero `ghostsHit`/`accentsHit` had a `totalScore` exceeding the sum of their own named breakdown fields by exactly 50 points per such hit (the 6th had an internally-inconsistent `comboScore` unrelated to this, so was treated as a bad record). "Expert+"/2x-kick alternate notes are excluded by default (a real leaderboard capture showed these belong to a separate, opt-in "Double Kick" score *modifier* with its own disjoint leaderboard, not the default chart) — Drums/Pro Drums get a Modifier selector (`countScoredDrumNotes`/`drumTrackToDifficultyTrack` both take a `DrumScoreModifier`) so selecting `doubleKick` includes them as regular kick hits, and `noKick` removes every kick-lane note instead (confirmed against a real chart's exact numbers: note count and reference max score both dropped by precisely the kick-note count and that count × 50 points). With cymbal points, the ghost/accent bonus, and the default Expert+ exclusion combined, a real chart's calculated full-combo max lands comfortably **above** a real near-full-combo score (missing 1 of 1,539 notes) — the expected pattern, and the strongest evidence yet this formula is close to correct. Still not verified the byte-exact way guitar/bass is — see the in-app caveat. "Drums" and "Pro Drums" are offered as separate instruments (matching Clone Hero's own leaderboards) but currently compute an identical score, since there's no evidence the scoring formula itself differs between the two — though in practice, checked against one real chart's leaderboard, nearly all live scores land under "Pro Drums" regardless of which instrument/controller was actually used in-game.
- **Star Power optimizer** (`src/scoring/optimizer.ts`): dynamic programming over every SP phrase to find the banking/activation combination that maximizes the score bonus. The gauge mechanic (25%/phrase, 1/30 of the gauge per quarter-note of whammy, a full gauge draining over exactly 8 measures) follows the model used by [CHOpt](https://github.com/GenericMadScientist/CHOpt), the open-source SP path optimizer the Clone Hero community uses to verify leaderboard runs — simplified by not simulating note-level timing-squeeze techniques.
- **Leaderboard hash** (`src/leaderboard/`): Clone Hero identifies a chart on `leaderboards.clonehero.net` by a BLAKE3 hash of the parsed chart data plus `song.ini` metadata (the format is not publicly documented) - the hash is per-*song*, not per-instrument, so the same hash is reused to view any instrument/difficulty's leaderboard, only the URL's `instrument`/`difficulty`/`controllerTypes` query params change (`computeLeaderboardHash` computes the hash once; `buildLeaderboardUrl` builds the link for whatever instrument+difficulty is currently selected in the app). This was reverse-engineered from the game's own IL2CPP binary — decompiled with Ghidra and traced with a live debugger (x64dbg) against real in-game memory buffers — and is verified byte-for-byte against real leaderboard hashes for Guitar/Bass/Rhythm tracks in both `.chart` and `.mid` files, plus `.mid`-format Drums, via a full end-to-end match against a real multi-instrument `.mid` capture. That included working out exactly how a HOPO/forced marker authored only on the Expert difficulty carries over to the other difficulties (a single-note "tap" blip behaves like "forced", while a marker spanning a whole section cascades to every difficulty as a genuine tap), and fully decoding the drum note/dynamics encoding (`src/parsers/midDrumParser.ts`, `src/leaderboard/drumTrackHash.ts`): kick/snare/cymbal-vs-tom lanes, ghost/accent velocity, double-kick, and drum-fill zones. `.chart`-format Drums (`src/parsers/chartDrumParser.ts`) is also supported, ported from the documented `.chart` drum note format (note types for kick/red/yellow/blue/green, double-kick, cymbal/ghost/accent range modifiers, and the SP activation/fill phrase) — unlike everything above, it's not independently verified against a real capture, since none of this project's example charts happen to use `.chart`-format drums (only correctness against a hand-built synthetic file with every note type could be confirmed). "Drums" and "Pro Drums" share the exact same hash (confirmed by comparing real leaderboard URLs for the same song) - only `instrument`/`controllerTypes` differ (`drums`/`5LaneDrums` vs `prodrums`/`7LaneDrums,5LaneDrums`), both defined in `LEADERBOARD_QUERY` (`src/leaderboard/songHash.ts`). Keyboard and 6-Fret instruments use the same reconstructed algorithm but with an unverified instrument index. The hash also embeds an entry for every charted *playable, scored* instrument this app can't parse (pro-instrument tracks, 5-lane Drums) — the link is hidden whenever the file has any, since it could never be reconstructed correctly without them. Lead/harmony vocals are the one exception: Clone Hero doesn't support playable vocal scoring (a charted vocals track only drives the on-screen scrolling lyrics), confirmed by a real capture where a charted vocals track produced no SongHash entry at all — so vocals don't block the link. `song.ini` is required, since the hash embeds fields (song length, modchart flag, charter icon) that aren't derivable from a chart file alone — confirmed directly by a Clone Hero developer that the game itself can't reliably fall back to chart-only defaults either.
- **Visualization** (`src/components/Highway.tsx`, `src/components/DrumHighway.tsx`): SVG highway rendering notes, sustains, SP phrases, and the calculated optimal activation windows - a dedicated component for Drums renders its 5 lanes (kick + 4 pads), cymbal-vs-tom shapes, ghost/accent dynamics, and double-kick instead.

All assumptions and simplifications are documented in-app under "Assumptions & Scoring Methodology" (bottom of the page).

## Getting started

```bash
npm install
npm run dev
```

Then drop `notes.chart`, `notes.mid`, or a zipped song folder onto the page (optionally together with `song.ini` and album art).

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

- [CHOpt](https://github.com/GenericMadScientist/CHOpt) and its [SightRead](https://github.com/GenericMadScientist/SightRead) parser library — used as the authoritative reference for scoring and Star Power mechanics
- [Clone Hero Wiki](https://wiki.clonehero.net/) — scoring dictionary and format documentation
- [GuitarGame_ChartFormats](https://thenathannator.github.io/GuitarGame_ChartFormats/) — `.chart`/`.mid` format reference

## License

[GPL-3.0](LICENSE)
