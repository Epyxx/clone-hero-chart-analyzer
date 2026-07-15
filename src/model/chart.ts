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
}
