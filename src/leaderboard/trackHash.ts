import { blake3 } from '@noble/hashes/blake3.js';
import type { DifficultyTrack, NoteEvent, TempoEvent, TimeSigEvent } from '../model/chart';

// Reverse-engineered from the live Clone Hero binary (GameAssembly.dll) via IL2CPP
// decompilation + runtime memory dumps, and verified byte-for-byte against real
// leaderboard hashes for several .chart-format guitar charts. Format is intentionally
// undocumented by Clone Hero; see AssumptionsPanel for the verification story.
const TRACK_MAGIC = 0x43484e46; // "CHNF", big-endian
const TRACK_VERSION = 20240320;

const TYPE_OPEN = 1;
const FRET_TYPE = [2, 3, 4, 5, 6]; // green, red, yellow, blue, orange (fret index 0-4)
const FLAG_STRUM = 1;
const FLAG_HOPO = 2;
const FLAG_TAP = 4;

interface ResolvedNote {
  tick: number;
  length: number;
  type: number;
  flags: number;
}

function isChordNote(n: NoteEvent): boolean {
  return !n.isOpen && n.frets.length > 1;
}

/** Compares the "shape" of two non-chord notes (open vs. a specific fret). */
function sameSingleNoteShape(a: NoteEvent, b: NoteEvent): boolean {
  if (a.isOpen !== b.isOpen) return false;
  if (a.isOpen) return true;
  return a.frets[0] === b.frets[0];
}

/**
 * Natural-HOPO determination, matching Clone Hero's own rules (confirmed via live
 * debugging): gap-to-previous-note, current-is-chord, and same-single-note-as-previous
 * all force a strum. `.mid`-only exception: if the previous note was a chord and the
 * current single note's fret was part of that chord, it's also forced to a strum (this
 * only manifested as a bug for multi-instrument `.mid` charts with chords - see the
 * verification note in AssumptionsPanel).
 */
function isNaturalHopo(prev: NoteEvent | null, current: NoteEvent, hopoThresholdTicks: number, format: 'chart' | 'mid'): boolean {
  if (!prev) return false;
  if (current.tick - prev.tick > hopoThresholdTicks) return false;
  if (isChordNote(current)) return false;
  if (!isChordNote(prev) && sameSingleNoteShape(prev, current)) return false;
  if (format === 'mid' && isChordNote(prev) && !current.isOpen && prev.frets.includes(current.frets[0])) return false;
  return true;
}

function resolveNotes(notes: NoteEvent[], hopoThresholdTicks: number, sustainCutoffTicks: number, format: 'chart' | 'mid'): ResolvedNote[] {
  const trim = (length: number) => (length <= sustainCutoffTicks ? 0 : length);
  const out: ResolvedNote[] = [];
  let prev: NoteEvent | null = null;
  for (const note of notes) {
    const natural = isNaturalHopo(prev, note, hopoThresholdTicks, format);
    const flags = note.isTap ? FLAG_TAP : (note.isForced ? !natural : natural) ? FLAG_HOPO : FLAG_STRUM;

    if (note.isOpen) {
      out.push({ tick: note.tick, length: trim(note.length), type: TYPE_OPEN, flags });
    } else {
      for (let i = 0; i < note.frets.length; i++) {
        const fret = note.frets[i];
        const length = trim(note.fretLengths[i] ?? note.length);
        out.push({ tick: note.tick, length, type: FRET_TYPE[fret], flags });
      }
    }
    prev = note;
  }
  return out;
}

/** Drops SP/solo phrases that don't contain any resolved note (matches Clone Hero's own pruning). */
function pruneEmptyPhrases<T extends { tick: number; length: number }>(phrases: T[], notes: ResolvedNote[]): T[] {
  const kept: T[] = [];
  let noteIndex = 0;
  for (const phrase of phrases) {
    while (noteIndex < notes.length && notes[noteIndex].tick < phrase.tick) noteIndex++;
    if (noteIndex < notes.length && notes[noteIndex].tick < phrase.tick + (phrase.length || 1)) kept.push(phrase);
  }
  return kept;
}

/**
 * Prefers the tempo's authored `beatsPerMinute` (set for `.chart`) over re-deriving it from
 * `usPerQuarter` - re-deriving is a lossy float64 round-trip that can differ from the authored
 * value in the last bit (see TempoEvent), which is enough to change the hash entirely. `.mid`
 * tempos have no authored BPM at all, so `usPerQuarter` is the only source there - this was
 * already the byte-verified path for `.mid` and is unaffected.
 */
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

export interface TrackHashInput {
  resolution: number;
  tempos: TempoEvent[];
  timeSigs: TimeSigEvent[];
  track: DifficultyTrack;
  /** `.mid` uses a different default HOPO threshold and sustain-cutoff than `.chart`. */
  format: 'chart' | 'mid';
  /** From song.ini `hopo_frequency` / `eighthnote_hopo`, if set. */
  hopoFrequency?: number;
  eighthNoteHopo?: boolean;
  /** From song.ini `sustain_cutoff_threshold`, if set. */
  sustainCutoffThreshold?: number;
}

function computeHopoThresholdTicks(resolution: number, format: 'chart' | 'mid', hopoFrequency?: number, eighthNoteHopo?: boolean): number {
  if (hopoFrequency) return hopoFrequency;
  if (eighthNoteHopo) return Math.floor(1 + resolution / 2);
  return format === 'mid' ? Math.floor(1 + resolution / 3) : Math.floor((65 / 192) * resolution);
}

/**
 * Unlike the max-score calculator (which never trims sustains by default, to avoid ever
 * under-counting the true max), the leaderboard hash must match Clone Hero's own default
 * exactly - which does apply a cutoff for `.mid` charts unless overridden.
 */
function computeSustainCutoffTicks(resolution: number, format: 'chart' | 'mid', override?: number): number {
  if (override !== undefined) return override;
  return format === 'mid' ? Math.floor(resolution / 3) + 1 : 0;
}

export function buildTrackHashBuffer(input: TrackHashInput): Uint8Array {
  const hopoThresholdTicks = computeHopoThresholdTicks(input.resolution, input.format, input.hopoFrequency, input.eighthNoteHopo);
  const sustainCutoffTicks = computeSustainCutoffTicks(input.resolution, input.format, input.sustainCutoffThreshold);
  const resolvedNotes = resolveNotes(input.track.notes, hopoThresholdTicks, sustainCutoffTicks, input.format);
  const tempos = dedupTemposByTick(input.tempos);
  const timeSigs = dedupTimeSigsByTick(input.timeSigs);
  const starPower = pruneEmptyPhrases(input.track.starPower, resolvedNotes);
  const solos = pruneEmptyPhrases(input.track.solos, resolvedNotes);

  const total =
    12 +
    4 + 16 * tempos.length +
    4 + 16 * timeSigs.length +
    4 + 16 * starPower.length +
    4 + 16 * solos.length +
    4 + 4 + // flex lanes / drum freestyle counts (always 0 - not supported)
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
  view.setInt32(i, 0, true); // drum freestyle count
  i += 4;

  view.setInt32(i, resolvedNotes.length, true);
  i += 4;
  for (const n of resolvedNotes) {
    view.setBigInt64(i, BigInt(n.tick), true);
    view.setBigInt64(i + 8, BigInt(n.length), true);
    view.setUint32(i + 16, n.type, true);
    view.setUint32(i + 20, n.flags, true);
    i += 24;
  }

  return new Uint8Array(buffer);
}

export function computeTrackHashRaw(input: TrackHashInput): Uint8Array {
  return blake3(buildTrackHashBuffer(input));
}
