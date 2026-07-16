import type { DrumDifficultyTrack, DrumFreestyleSection, DrumNoteEvent, SoloSection, StarPowerPhrase } from '../model/chart';

interface MidiEvent {
  tick: number;
  type: 'noteOn' | 'noteOff' | 'tempo' | 'timeSig' | 'text' | 'trackName';
  note?: number;
  velocity?: number;
  text?: string;
}

const DIFF_BASES: { difficulty: DrumDifficultyTrack['difficulty']; base: number }[] = [
  { difficulty: 'Easy', base: 60 },
  { difficulty: 'Medium', base: 72 },
  { difficulty: 'Hard', base: 84 },
  { difficulty: 'Expert', base: 96 },
];

const SP_NOTE = 116;
const SOLO_NOTE = 103;
/** Cymbal/tom override markers - global across all difficulties (not per-difficulty-base). */
const TOM_MARKER_NOTE: Record<2 | 3 | 4, number> = { 2: 110, 3: 111, 4: 112 };
/** Drum fill / freestyle zone - fired identically on all 5 lanes, only need to read one. */
const FREESTYLE_NOTE = 120;
const GHOST_VELOCITY_MAX = 64;
const ACCENT_VELOCITY_MIN = 127;

function collectRanges(events: MidiEvent[], note: number): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let start: number | null = null;
  for (const e of events) {
    if (e.note !== note) continue;
    if (e.type === 'noteOn') start = e.tick;
    else if (e.type === 'noteOff' && start !== null) {
      ranges.push({ start, end: e.tick });
      start = null;
    }
  }
  return ranges;
}

function inRanges(ranges: { start: number; end: number }[], tick: number): boolean {
  return ranges.some((r) => tick >= r.start && tick < r.end);
}

function pruneEmptyPhrases<T extends { tick: number; length: number }>(phrases: T[], notes: DrumNoteEvent[]): T[] {
  const kept: T[] = [];
  let noteIndex = 0;
  for (const phrase of phrases) {
    while (noteIndex < notes.length && notes[noteIndex].tick < phrase.tick) noteIndex++;
    if (noteIndex < notes.length && notes[noteIndex].tick < phrase.tick + (phrase.length || 1)) kept.push(phrase);
  }
  return kept;
}

/**
 * Parses the "PART DRUMS" track (.mid only - reverse-engineered from a real leaderboard hash
 * capture, see AssumptionsPanel). Standard 4-pad ("5-lane" note-slot) drums: base+0 = kick,
 * base+1..+4 = red/yellow/blue/green. base-1 is an alternate kick note used for a double-kick
 * hit (mutually exclusive with base+0, not a modifier on top of it). Cymbal/tom overrides
 * (notes 110/111/112 for yellow/blue/green) and drum-fill zones (notes 120-124, identical
 * across all 5) are global, not per-difficulty. Ghost/accent dynamics are velocity-encoded
 * (<=64 / >=127) and only meaningful when the chart has the `[ENABLE_CHART_DYNAMICS]` text
 * event; pro-drums toms/cymbals still resolve without it.
 */
export function parseDrumTrack(events: MidiEvent[]): Partial<Record<DrumDifficultyTrack['difficulty'], DrumDifficultyTrack>> {
  const hasDynamics = events.some((e) => e.type === 'text' && /ENABLE_CHART_DYNAMICS/i.test(e.text ?? ''));
  const tomRanges = { 2: collectRanges(events, TOM_MARKER_NOTE[2]), 3: collectRanges(events, TOM_MARKER_NOTE[3]), 4: collectRanges(events, TOM_MARKER_NOTE[4]) };
  const freestyleRanges = collectRanges(events, FREESTYLE_NOTE);
  const freestyle: DrumFreestyleSection[] = freestyleRanges.map((r) => ({ tick: r.start, length: r.end - r.start }));

  const result: Partial<Record<DrumDifficultyTrack['difficulty'], DrumDifficultyTrack>> = {};

  for (const { difficulty, base } of DIFF_BASES) {
    const active = new Map<number, { tick: number; velocity: number }>();
    const notes: DrumNoteEvent[] = [];
    const starPower: StarPowerPhrase[] = [];
    const solos: SoloSection[] = [];

    for (const e of events) {
      if (e.type === 'noteOn') {
        active.set(e.note!, { tick: e.tick, velocity: e.velocity ?? 96 });
      } else if (e.type === 'noteOff') {
        const start = active.get(e.note!);
        if (start === undefined) continue;
        active.delete(e.note!);
        const note = e.note!;

        if (note === SP_NOTE) {
          starPower.push({ tick: start.tick, length: e.tick - start.tick });
          continue;
        }
        if (note === SOLO_NOTE) {
          solos.push({ tick: start.tick, length: e.tick - start.tick });
          continue;
        }

        let lane: 0 | 1 | 2 | 3 | 4;
        let isDoubleKick = false;
        if (note === base - 1) {
          lane = 0;
          isDoubleKick = true;
        } else if (note >= base && note <= base + 4) {
          lane = (note - base) as 0 | 1 | 2 | 3 | 4;
        } else {
          continue; // not part of this difficulty (tom/freestyle/dynamics markers handled globally above)
        }

        const isCymbal = lane >= 2 && !inRanges(tomRanges[lane as 2 | 3 | 4], start.tick);
        const isGhost = hasDynamics && start.velocity <= GHOST_VELOCITY_MAX;
        const isAccent = hasDynamics && start.velocity >= ACCENT_VELOCITY_MIN;
        notes.push({ tick: start.tick, lane, isDoubleKick, isCymbal, isGhost, isAccent });
      }
    }

    if (notes.length === 0) continue;
    notes.sort((a, b) => a.tick - b.tick || a.lane - b.lane);
    starPower.sort((a, b) => a.tick - b.tick);
    solos.sort((a, b) => a.tick - b.tick);

    result[difficulty] = {
      difficulty,
      notes,
      starPower: pruneEmptyPhrases(starPower, notes),
      solos: pruneEmptyPhrases(solos, notes),
      freestyle,
    };
  }

  return result;
}
