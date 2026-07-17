// Unified chart model produced by both the .chart and .mid parsers.
// All positions are in ticks, relative to the song start (0).

export type Fret = 0 | 1 | 2 | 3 | 4; // green, red, yellow, blue, orange

export interface NoteEvent {
  tick: number;
  /** Sustain length in ticks (0 = no sustain / normal note) - the longest across all frets. */
  length: number;
  /** Frets held simultaneously (chord). Empty when isOpen is true. */
  frets: Fret[];
  /**
   * Per-fret sustain length in ticks, parallel to `frets` (same index order). Needed because a
   * "disjoint" chord (frets with different sustain lengths) is scored per-fret rather than as
   * one merged sustain - see scoreTrackBase. Absent/empty for open notes (open has no chord).
   */
  fretLengths: number[];
  isOpen: boolean;
  isForced: boolean; // strum/HOPO flip modifier present
  isTap: boolean;
  /** Resolved after parsing: true if this note is hit as a hammer-on/pull-off. */
  isHopo: boolean;
  /**
   * Per-fret point-value override, parallel to `frets` (same index order) - lets a chord mix
   * different point values per fret. Absent for guitar/bass (every fret is worth the engine's
   * flat `pointsPerNote`). Used by drums: a real leaderboard score breakdown showed cymbal hits
   * are worth 65 points versus 50 for kick/snare/tom - see drumAdapter.ts.
   */
  fretPoints?: number[];
  /**
   * Per-fret flat, unmultiplied bonus, parallel to `frets` (same index order) - added to
   * `cleanPlayBonus` instead of the engine's flat `cleanPlayBonusPerNote` when present. Absent
   * for guitar/bass. Used by drums: a real leaderboard score's total didn't match the sum of its
   * own displayed breakdown fields whenever `ghostsHit`/`accentsHit` were nonzero, by exactly 50
   * points per such hit across every real example checked - a bonus for playing a ghost/accent
   * note's dynamic correctly, present in the total but not broken out in any named field. See
   * drumAdapter.ts.
   */
  fretCleanPlayBonus?: number[];
}

export interface StarPowerPhrase {
  tick: number;
  length: number;
}

export interface SoloSection {
  tick: number;
  length: number;
}

export interface TempoEvent {
  tick: number;
  /** Microseconds per quarter note. */
  usPerQuarter: number;
}

export interface TimeSigEvent {
  tick: number;
  numerator: number;
  denominator: number; // e.g. 4 means quarter note gets the beat
}

export interface DifficultyTrack {
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  notes: NoteEvent[];
  starPower: StarPowerPhrase[];
  solos: SoloSection[];
}

export interface InstrumentCharts {
  instrument: string; // 'Single' (lead guitar), 'DoubleBass', 'DoubleRhythm', 'Keyboard' etc.
  difficulties: Partial<Record<DifficultyTrack['difficulty'], DifficultyTrack>>;
}

/**
 * Drums has a fundamentally different note/lane model than 5-fret/6-fret (kick + 4 pads,
 * cymbal/tom + ghost/accent dynamics instead of chords/HOPO/tap), so it's represented
 * separately from `InstrumentCharts` rather than forced into the guitar-shaped model. Only used
 * for the leaderboard hash (`src/leaderboard/`) - not wired into scoring or the highway, which
 * don't support drums.
 */
export interface DrumNoteEvent {
  tick: number;
  /** 0=kick, 1=red, 2=yellow, 3=blue, 4=green. */
  lane: 0 | 1 | 2 | 3 | 4;
  isDoubleKick: boolean;
  /** Only meaningful for lanes 2-4 (yellow/blue/green): true = tom, false = cymbal. */
  isCymbal: boolean;
  isGhost: boolean;
  isAccent: boolean;
}

export interface DrumFreestyleSection {
  tick: number;
  length: number;
}

export interface DrumDifficultyTrack {
  difficulty: DifficultyTrack['difficulty'];
  notes: DrumNoteEvent[];
  starPower: StarPowerPhrase[];
  solos: SoloSection[];
  freestyle: DrumFreestyleSection[];
}

export interface ParsedChart {
  formatSource: 'chart' | 'mid';
  name?: string;
  artist?: string;
  charter?: string;
  album?: string;
  genre?: string;
  year?: string;
  resolution: number; // ticks per quarter note
  tempos: TempoEvent[];
  timeSigs: TimeSigEvent[];
  instruments: InstrumentCharts[];
  /** Length of the song in ticks (last event position, for display range). */
  lastTick: number;
  /** Drums, if present and parseable (currently `.mid` only - see DrumDifficultyTrack). */
  drums?: Partial<Record<DifficultyTrack['difficulty'], DrumDifficultyTrack>>;
  /**
   * Instrument identifiers found in the file that this app doesn't parse (e.g. "Drums" - not
   * scoreable, no 5-fret/6-fret note lanes). Chart-format tracks other than the ones represented
   * in `instruments` are silently skipped during parsing; this records what was skipped so
   * features that need the *complete* instrument list (e.g. the leaderboard hash, which embeds
   * every charted instrument) can detect when they'd be working from incomplete data.
   */
  unsupportedInstruments: string[];
}
