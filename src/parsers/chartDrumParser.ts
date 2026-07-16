import type { DrumDifficultyTrack, DrumFreestyleSection, DrumNoteEvent, SoloSection, StarPowerPhrase } from '../model/chart';

// Reverse-engineered from the GuitarGame_ChartFormats documentation (the same source already
// cited for this app's guitar .chart parsing) - NOT verified against a real leaderboard capture
// the way the .mid drum parser is (see AssumptionsPanel). Standard 4-lane drums only; a 5-lane
// track (note type 5) has no equivalent in this app's drum model and is reported as such so the
// caller can treat the file as unsupported rather than silently mis-hashing it.
const ACCENT_TYPE_TO_LANE: Record<number, 1 | 2 | 3 | 4> = { 34: 1, 35: 2, 36: 3, 37: 4 };
const GHOST_TYPE_TO_LANE: Record<number, 1 | 2 | 3 | 4> = { 40: 1, 41: 2, 42: 3, 43: 4 };
const CYMBAL_TYPE_TO_LANE: Record<number, 2 | 3 | 4> = { 66: 2, 67: 3, 68: 4 };
const DOUBLE_KICK_TYPE = 32;
const FIVE_LANE_GREEN_TYPE = 5;
const SP_PHRASE_TYPE = 2;
/** "Drums Star Power activation phrase" - lets a fill be played through to activate SP without
 * a cymbal/pad combo; the same concept as .mid's freestyle zones (notes 120-124). */
const FILL_PHRASE_TYPE = 64;

function parseKeyValue(line: string): { key: string; value: string } | null {
  const idx = line.indexOf('=');
  if (idx === -1) return null;
  return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
}

function inRanges(ranges: { start: number; end: number }[], tick: number): boolean {
  return ranges.some((r) => tick >= r.start && tick < r.end);
}

interface BaseHit {
  tick: number;
  lane: 0 | 1 | 2 | 3 | 4;
  isDoubleKick: boolean;
}

export interface ChartDrumParseResult {
  track: DrumDifficultyTrack | null;
  /** True if the section used any 5-lane-only note type - unsupported, see module doc. */
  isFiveLane: boolean;
}

export function parseChartDrumTrack(lines: string[], difficulty: DrumDifficultyTrack['difficulty']): ChartDrumParseResult {
  const baseHits: BaseHit[] = [];
  const accentRanges: Record<1 | 2 | 3 | 4, { start: number; end: number }[]> = { 1: [], 2: [], 3: [], 4: [] };
  const ghostRanges: Record<1 | 2 | 3 | 4, { start: number; end: number }[]> = { 1: [], 2: [], 3: [], 4: [] };
  const cymbalRanges: Record<2 | 3 | 4, { start: number; end: number }[]> = { 2: [], 3: [], 4: [] };
  const starPower: StarPowerPhrase[] = [];
  const freestyle: DrumFreestyleSection[] = [];
  const solos: SoloSection[] = [];
  let soloStart: number | null = null;
  let isFiveLane = false;

  for (const line of lines) {
    const kv = parseKeyValue(line);
    if (!kv) continue;
    const tick = parseInt(kv.key, 10);
    const parts = kv.value.split(/\s+/).filter(Boolean);
    const lineType = parts[0];

    if (lineType === 'N') {
      const type = parseInt(parts[1], 10);
      const length = parseInt(parts[2], 10);
      if (type === FIVE_LANE_GREEN_TYPE) {
        isFiveLane = true;
        continue;
      }
      if (type >= 0 && type <= 4) {
        baseHits.push({ tick, lane: type as 0 | 1 | 2 | 3 | 4, isDoubleKick: false });
      } else if (type === DOUBLE_KICK_TYPE) {
        baseHits.push({ tick, lane: 0, isDoubleKick: true });
      } else if (type in ACCENT_TYPE_TO_LANE) {
        const lane = ACCENT_TYPE_TO_LANE[type];
        accentRanges[lane].push({ start: tick, end: tick + Math.max(length, 1) });
      } else if (type in GHOST_TYPE_TO_LANE) {
        const lane = GHOST_TYPE_TO_LANE[type];
        ghostRanges[lane].push({ start: tick, end: tick + Math.max(length, 1) });
      } else if (type in CYMBAL_TYPE_TO_LANE) {
        const lane = CYMBAL_TYPE_TO_LANE[type];
        cymbalRanges[lane].push({ start: tick, end: tick + Math.max(length, 1) });
      }
    } else if (lineType === 'S') {
      const type = parseInt(parts[1], 10);
      const length = parseInt(parts[2], 10);
      if (type === SP_PHRASE_TYPE) starPower.push({ tick, length });
      else if (type === FILL_PHRASE_TYPE) freestyle.push({ tick, length });
    } else if (lineType === 'E') {
      const text = parts.slice(1).join(' ').replace(/^"|"$/g, '');
      if (text === 'solo') soloStart = tick;
      else if (text === 'soloend' && soloStart !== null) {
        // Matches the guitar .chart parser's inclusive-end convention (see chartParser.ts).
        solos.push({ tick: soloStart, length: tick - soloStart + 1 });
        soloStart = null;
      }
    }
  }

  if (isFiveLane) return { track: null, isFiveLane: true };
  if (baseHits.length === 0) return { track: null, isFiveLane: false };

  const notes: DrumNoteEvent[] = baseHits
    .map((h) => ({
      tick: h.tick,
      lane: h.lane,
      isDoubleKick: h.isDoubleKick,
      isCymbal: h.lane >= 2 && inRanges(cymbalRanges[h.lane as 2 | 3 | 4], h.tick),
      isGhost: h.lane >= 1 && inRanges(ghostRanges[h.lane as 1 | 2 | 3 | 4], h.tick),
      isAccent: h.lane >= 1 && inRanges(accentRanges[h.lane as 1 | 2 | 3 | 4], h.tick),
    }))
    .sort((a, b) => a.tick - b.tick || a.lane - b.lane);

  starPower.sort((a, b) => a.tick - b.tick);
  solos.sort((a, b) => a.tick - b.tick);
  freestyle.sort((a, b) => a.tick - b.tick);

  return { track: { difficulty, notes, starPower, solos, freestyle }, isFiveLane: false };
}
