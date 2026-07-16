import type { ParsedChart } from '../model/chart';
import type { SongIni } from '../parsers/songIni';
import {
  DIFFICULTY_ORDER,
  INSTRUMENT_INDEX,
  INSTRUMENT_QUERY_NAME,
  computeSongHash,
  type SongHashTrackEntry,
} from './songHash';
import { computeTrackHashRaw } from './trackHash';

export interface LeaderboardLinkResult {
  hash: string;
  /** instrument -> query name used to pre-select the leaderboard's filter UI. */
  defaultInstrument: string;
  defaultDifficulty: string;
  url: string;
}

/**
 * Computes the Clone Hero leaderboard SongHash for a parsed chart and builds a link to
 * `leaderboards.clonehero.net`. Only guitar/bass/rhythm `.chart` files have been verified
 * byte-for-byte against real leaderboard hashes; Keyboard, GHL instruments, and `.mid`
 * charts use the same algorithm but with unverified instrument indices / defaults - see
 * the caveat in AssumptionsPanel. Returns `null` if the chart has no supported instrument.
 *
 * Requires `ini` (song.ini): the hash embeds `songLength`, `modchart`, and `icon`, none of
 * which are derivable from a .chart/.mid file alone (and for .mid, no metadata at all is
 * present without song.ini) - without it, the computed hash would not match the real one.
 */
export function computeLeaderboardLink(chart: ParsedChart, ini: SongIni | null, lengthSeconds: number): LeaderboardLinkResult | null {
  if (!ini) return null;

  const entries: SongHashTrackEntry[] = [];
  let firstInstrument: string | null = null;
  let firstDifficulty: string | null = null;

  const supportedInstruments = chart.instruments
    .filter((inst) => inst.instrument in INSTRUMENT_INDEX)
    .sort((a, b) => INSTRUMENT_INDEX[a.instrument] - INSTRUMENT_INDEX[b.instrument]);

  for (const inst of supportedInstruments) {
    for (let diffIdx = 0; diffIdx < DIFFICULTY_ORDER.length; diffIdx++) {
      const difficulty = DIFFICULTY_ORDER[diffIdx];
      const track = inst.difficulties[difficulty];
      if (!track) continue;

      const trackHashRaw = computeTrackHashRaw({
        resolution: chart.resolution,
        tempos: chart.tempos,
        timeSigs: chart.timeSigs,
        track,
        format: chart.formatSource,
        hopoFrequency: ini?.hopoFrequency,
        eighthNoteHopo: ini?.eighthNoteHopo,
        sustainCutoffThreshold: ini?.sustainCutoffThreshold,
      });

      entries.push({ instrumentIndex: INSTRUMENT_INDEX[inst.instrument], difficultyIndex: diffIdx, trackHashRaw });
      if (!firstInstrument) {
        firstInstrument = INSTRUMENT_QUERY_NAME[inst.instrument];
        firstDifficulty = difficulty.toLowerCase();
      }
    }
  }

  if (entries.length === 0 || !firstInstrument || !firstDifficulty) return null;

  const name = ini?.name ?? chart.name ?? 'Unknown Name';
  const artist = ini?.artist ?? chart.artist ?? 'Unknown Artist';
  const album = ini?.album ?? chart.album ?? 'Unknown Album';
  const genre = ini?.genre ?? chart.genre ?? 'Unknown Genre';
  const year = ini?.year ?? chart.year ?? 'Unknown Year';
  const songLengthMs = ini?.songLengthMs ?? Math.round(lengthSeconds * 1000);
  const modchart = Number(ini?.raw['modchart'] ?? '0') || 0;
  const charter = ini?.charter ?? chart.charter ?? 'Unknown Charter';
  const icon = ini?.icon ?? charter.toLowerCase();

  const hash = computeSongHash({ name, artist, album, genre, year, songLengthMs, modchart, charter, icon }, entries);

  const controllerTypes = firstInstrument.startsWith('guitarghl') || firstInstrument === 'bassghl' ? '6Fret' : '5Fret';
  const params = new URLSearchParams({
    instrument: firstInstrument,
    difficulty: firstDifficulty,
    controllerTypes,
    modifiers: '',
    minSpeed: '100',
    maxSpeed: '120',
    sort: 'score',
  });

  return {
    hash,
    defaultInstrument: firstInstrument,
    defaultDifficulty: firstDifficulty,
    url: `https://leaderboards.clonehero.net/scores/${hash}?${params.toString()}`,
  };
}
