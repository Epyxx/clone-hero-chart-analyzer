import type { ParsedChart } from '../model/chart';
import type { SongIni } from '../parsers/songIni';
import {
  DIFFICULTY_ORDER,
  DRUMS_INSTRUMENT_INDEX,
  INSTRUMENT_INDEX,
  LEADERBOARD_QUERY,
  computeSongHash,
  type SongHashTrackEntry,
} from './songHash';
import { computeTrackHashRaw } from './trackHash';
import { computeDrumTrackHashRaw } from './drumTrackHash';

/**
 * Computes the Clone Hero leaderboard SongHash for a parsed chart - the identifier used in
 * `leaderboards.clonehero.net/scores/{hash}`. Guitar/Bass/Rhythm and `.mid`-format Drums are
 * verified byte-for-byte against real leaderboard hashes (Guitar/Bass/Rhythm for `.chart` too);
 * `.chart`-format Drums is a best-effort port of the documented `.chart` drum note format, not
 * independently verified the same way; Keyboard and GHL instruments use the same algorithm but
 * with an unverified instrument index - see the caveat in AssumptionsPanel. Returns `null` if
 * the chart has no supported instrument.
 *
 * The hash is per-SONG, not per-instrument: it embeds one TrackHash entry for every charted
 * instrument/difficulty, and the SAME hash is used to view any of their leaderboards - only the
 * URL's `instrument`/`difficulty`/`controllerTypes` query params change (confirmed directly:
 * "Drums" and "Pro Drums" leaderboards for the same song share an identical hash). See
 * `buildLeaderboardUrl` for turning this hash into a link for a specific instrument/difficulty.
 *
 * The SongHash embeds an entry for *every* charted playable/scored instrument this app can't
 * parse (pro-instrument tracks, 5-lane drums, ...) - if the file has any, the hash can never be
 * reconstructed correctly, so this returns `null` whenever `unsupportedInstruments` is
 * non-empty. Vocals are the one exception (see `NON_SCOREABLE_TRACKS` in midParser.ts): Clone
 * Hero doesn't support playable vocal scoring, and a real capture confirmed a charted vocals
 * track produces no SongHash entry at all.
 *
 * Requires `ini` (song.ini): the hash embeds `songLength`, `modchart`, and `icon`, none of
 * which are derivable from a chart file alone - without it, the computed hash would not match
 * the real one.
 */
export function computeLeaderboardHash(chart: ParsedChart, ini: SongIni | null, lengthSeconds: number): string | null {
  if (!ini || chart.unsupportedInstruments.length > 0) return null;

  const entries: SongHashTrackEntry[] = [];

  for (const inst of chart.instruments) {
    if (!(inst.instrument in INSTRUMENT_INDEX)) continue;
    for (let diffIdx = 0; diffIdx < DIFFICULTY_ORDER.length; diffIdx++) {
      const track = inst.difficulties[DIFFICULTY_ORDER[diffIdx]];
      if (!track) continue;
      const trackHashRaw = computeTrackHashRaw({
        resolution: chart.resolution,
        tempos: chart.tempos,
        timeSigs: chart.timeSigs,
        track,
        format: chart.formatSource,
        hopoFrequency: ini.hopoFrequency,
        eighthNoteHopo: ini.eighthNoteHopo,
        sustainCutoffThreshold: ini.sustainCutoffThreshold,
      });
      entries.push({ instrumentIndex: INSTRUMENT_INDEX[inst.instrument], difficultyIndex: diffIdx, trackHashRaw });
    }
  }

  if (chart.drums) {
    const drums = chart.drums;
    for (let diffIdx = 0; diffIdx < DIFFICULTY_ORDER.length; diffIdx++) {
      const track = drums[DIFFICULTY_ORDER[diffIdx]];
      if (!track) continue;
      const trackHashRaw = computeDrumTrackHashRaw({ resolution: chart.resolution, tempos: chart.tempos, timeSigs: chart.timeSigs, track });
      entries.push({ instrumentIndex: DRUMS_INSTRUMENT_INDEX, difficultyIndex: diffIdx, trackHashRaw });
    }
  }

  if (entries.length === 0) return null;
  entries.sort((a, b) => a.instrumentIndex - b.instrumentIndex || a.difficultyIndex - b.difficultyIndex);

  const name = ini.name ?? chart.name ?? 'Unknown Name';
  const artist = ini.artist ?? chart.artist ?? 'Unknown Artist';
  const album = ini.album ?? chart.album ?? 'Unknown Album';
  const genre = ini.genre ?? chart.genre ?? 'Unknown Genre';
  const year = ini.year ?? chart.year ?? 'Unknown Year';
  const songLengthMs = ini.songLengthMs ?? Math.round(lengthSeconds * 1000);
  const modchart = Number(ini.raw['modchart'] ?? '0') || 0;
  const charter = ini.charter ?? chart.charter ?? 'Unknown Charter';
  const icon = ini.icon ?? charter.toLowerCase();

  return computeSongHash({ name, artist, album, genre, year, songLengthMs, modchart, charter, icon }, entries);
}

/**
 * Builds a `leaderboards.clonehero.net` URL for a specific instrument+difficulty, given a hash
 * from `computeLeaderboardHash`. `instrumentKey` is this app's internal instrument id (e.g.
 * `Single`, `DoubleBass`, `Drums`, `ProDrums`) - returns `null` for an id with no known
 * leaderboard query mapping.
 */
export function buildLeaderboardUrl(hash: string, instrumentKey: string, difficulty: string): string | null {
  const query = LEADERBOARD_QUERY[instrumentKey];
  if (!query) return null;
  const params = new URLSearchParams({
    instrument: query.queryName,
    difficulty: difficulty.toLowerCase(),
    controllerTypes: query.controllerTypes,
    modifiers: '',
    minSpeed: '100',
    maxSpeed: '120',
    sort: 'score',
  });
  return `https://leaderboards.clonehero.net/scores/${hash}?${params.toString()}`;
}
