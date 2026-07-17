import { blake3 } from '@noble/hashes/blake3.js';
import type { DrumDifficultyTrack, TempoEvent, TimeSigEvent } from '../model/chart';

// Reverse-engineered from a real leaderboard hash capture of a multi-instrument .mid chart
// (drums specifically) - see AssumptionsPanel for the verification story. Shares the TrackHash
// buffer format with 5-fret/6-fret (src/leaderboard/trackHash.ts) but with drum-specific note
// types/flags and (unlike guitar) real, non-empty "freestyle" entries for drum-fill zones.
const TRACK_MAGIC = 0x43484e46; // "CHNF", big-endian
const TRACK_VERSION = 20240320;

const TYPE_BASE = 13; // kick=13, red=14, yellow=15, blue=16, green=17 (lane 0-4)
const FLAG_DOUBLE_KICK = 8;
const FLAG_TOM = 16;
const FLAG_CYMBAL = 32;
const FLAG_GHOST = 512;
const FLAG_ACCENT = 1024;

interface ResolvedDrumNote {
  tick: number;
  type: number;
  flags: number;
}

function resolveNotes(notes: DrumDifficultyTrack['notes']): ResolvedDrumNote[] {
  return notes.map((n) => {
    let flags = 0;
    if (n.lane === 0) {
      flags = n.isDoubleKick ? FLAG_DOUBLE_KICK : 0;
    } else {
      flags = n.lane >= 2 ? (n.isCymbal ? FLAG_CYMBAL : FLAG_TOM) : FLAG_TOM;
      if (n.isGhost) flags |= FLAG_GHOST;
      if (n.isAccent) flags |= FLAG_ACCENT;
    }
    return { tick: n.tick, type: TYPE_BASE + n.lane, flags };
  });
}

function pruneEmptyPhrases<T extends { tick: number; length: number }>(phrases: T[], notes: ResolvedDrumNote[]): T[] {
  const kept: T[] = [];
  let noteIndex = 0;
  for (const phrase of phrases) {
    while (noteIndex < notes.length && notes[noteIndex].tick < phrase.tick) noteIndex++;
    if (noteIndex < notes.length && notes[noteIndex].tick < phrase.tick + (phrase.length || 1)) kept.push(phrase);
  }
  return kept;
}

/** See the identical function in trackHash.ts for why `beatsPerMinute` must be preferred over
 * re-deriving BPM from `usPerQuarter` - a lossy float64 round-trip for `.chart` tempos. */
function dedupTemposByTick(tempos: TempoEvent[]): { tick: number; beatsPerMinute: number }[] {
  const map = new Map<number, number>();
  for (const t of tempos) map.set(t.tick, t.beatsPerMinute ?? 60000000 / t.usPerQuarter);
  return [...map.entries()].map(([tick, beatsPerMinute]) => ({ tick, beatsPerMinute })).sort((a, b) => a.tick - b.tick);
}

function dedupTimeSigsByTick(timeSigs: TimeSigEvent[]): TimeSigEvent[] {
  const map = new Map<number, TimeSigEvent>();
  for (const t of timeSigs) map.set(t.tick, t);
  return [...map.values()].sort((a, b) => a.tick - b.tick);
}

export interface DrumTrackHashInput {
  resolution: number;
  tempos: TempoEvent[];
  timeSigs: TimeSigEvent[];
  track: DrumDifficultyTrack;
}

export function buildDrumTrackHashBuffer(input: DrumTrackHashInput): Uint8Array {
  const resolvedNotes = resolveNotes(input.track.notes);
  const tempos = dedupTemposByTick(input.tempos);
  const timeSigs = dedupTimeSigsByTick(input.timeSigs);
  const starPower = pruneEmptyPhrases(input.track.starPower, resolvedNotes);
  const solos = pruneEmptyPhrases(input.track.solos, resolvedNotes);
  const freestyle = input.track.freestyle;

  const total =
    12 +
    4 + 16 * tempos.length +
    4 + 16 * timeSigs.length +
    4 + 16 * starPower.length +
    4 + 16 * solos.length +
    4 + // flex lanes count (always 0 - not used by drums either)
    4 + 17 * freestyle.length +
    4 + 24 * resolvedNotes.length;

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  view.setUint32(0, TRACK_MAGIC, false);
  view.setUint32(4, TRACK_VERSION, true);
  view.setUint32(8, input.resolution, true);
  let i = 12;

  view.setUint32(i, tempos.length, true);
  i += 4;
  for (const t of tempos) {
    view.setBigInt64(i, BigInt(t.tick), true);
    view.setFloat64(i + 8, t.beatsPerMinute, true);
    i += 16;
  }

  view.setUint32(i, timeSigs.length, true);
  i += 4;
  for (const t of timeSigs) {
    view.setBigInt64(i, BigInt(t.tick), true);
    view.setUint32(i + 8, t.numerator, true);
    view.setUint32(i + 12, t.denominator, true);
    i += 16;
  }

  view.setUint32(i, starPower.length, true);
  i += 4;
  for (const s of starPower) {
    view.setBigInt64(i, BigInt(s.tick), true);
    view.setBigInt64(i + 8, BigInt(s.length), true);
    i += 16;
  }

  view.setUint32(i, solos.length, true);
  i += 4;
  for (const s of solos) {
    view.setBigInt64(i, BigInt(s.tick), true);
    view.setBigInt64(i + 8, BigInt(s.length), true);
    i += 16;
  }

  view.setUint32(i, 0, true); // flex lanes count
  i += 4;

  view.setUint32(i, freestyle.length, true);
  i += 4;
  for (const f of freestyle) {
    view.setBigInt64(i, BigInt(f.tick), true);
    view.setBigInt64(i + 8, BigInt(f.length), true);
    view.setUint8(i + 16, 0); // flag byte - always 0 in every real capture seen so far
    i += 17;
  }

  view.setInt32(i, resolvedNotes.length, true);
  i += 4;
  for (const n of resolvedNotes) {
    view.setBigInt64(i, BigInt(n.tick), true);
    view.setBigInt64(i + 8, 0n); // drum notes are always instantaneous (no sustain)
    view.setUint32(i + 16, n.type, true);
    view.setUint32(i + 20, n.flags, true);
    i += 24;
  }

  return new Uint8Array(buffer);
}

export function computeDrumTrackHashRaw(input: DrumTrackHashInput): Uint8Array {
  return blake3(buildDrumTrackHashBuffer(input));
}
