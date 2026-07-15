import type {
  DifficultyTrack,
  Fret,
  InstrumentCharts,
  NoteEvent,
  ParsedChart,
  SoloSection,
  StarPowerPhrase,
  TempoEvent,
  TimeSigEvent,
} from '../model/chart';
import { resolveHopos } from './hopo';

const TRACK_NAME_TO_INSTRUMENT: Record<string, string> = {
  'PART GUITAR': 'Single',
  'PART GUITAR COOP': 'DoubleGuitar',
  'PART BASS': 'DoubleBass',
  'PART RHYTHM': 'DoubleRhythm',
  'PART KEYS': 'Keyboard',
  'T1 GEMS': 'Single', // very old RB1-era naming fallback
};

const DIFF_BASE_NOTES: { difficulty: DifficultyTrack['difficulty']; base: number }[] = [
  { difficulty: 'Easy', base: 60 },
  { difficulty: 'Medium', base: 72 },
  { difficulty: 'Hard', base: 84 },
  { difficulty: 'Expert', base: 96 },
];

const DEFAULT_STAR_POWER_NOTE = 116;
const SOLO_NOTE = 103;

class ByteReader {
  pos = 0;
  private data: DataView;
  constructor(data: DataView) {
    this.data = data;
  }
  get length() {
    return this.data.byteLength;
  }
  u8(): number {
    return this.data.getUint8(this.pos++);
  }
  peek(): number {
    return this.data.getUint8(this.pos);
  }
  u16(): number {
    const v = this.data.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    const v = this.data.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  bytes(n: number): Uint8Array {
    const v = new Uint8Array(this.data.buffer, this.data.byteOffset + this.pos, n);
    this.pos += n;
    return v;
  }
  vlq(): number {
    let value = 0;
    for (;;) {
      const b = this.u8();
      value = (value << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return value;
  }
}

interface MidiEvent {
  tick: number;
  type: 'noteOn' | 'noteOff' | 'tempo' | 'timeSig' | 'text' | 'trackName';
  note?: number;
  velocity?: number;
  usPerQuarter?: number;
  numerator?: number;
  denominator?: number;
  text?: string;
}

function readTrack(reader: ByteReader): MidiEvent[] {
  const magic = String.fromCharCode(reader.u8(), reader.u8(), reader.u8(), reader.u8());
  const len = reader.u32();
  const trackEnd = reader.pos + len;
  if (magic !== 'MTrk') {
    reader.pos = trackEnd;
    return [];
  }
  const events: MidiEvent[] = [];
  let tick = 0;
  let runningStatus = 0;
  while (reader.pos < trackEnd) {
    const delta = reader.vlq();
    tick += delta;
    let status = reader.peek();
    if (status & 0x80) {
      status = reader.u8();
      runningStatus = status;
    } else {
      status = runningStatus;
    }
    const type = status & 0xf0;

    if (status === 0xff) {
      const metaType = reader.u8();
      const metaLen = reader.vlq();
      const bytes = reader.bytes(metaLen);
      if (metaType === 0x51 && metaLen === 3) {
        const usPerQuarter = (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
        events.push({ tick, type: 'tempo', usPerQuarter });
      } else if (metaType === 0x58 && metaLen >= 2) {
        events.push({ tick, type: 'timeSig', numerator: bytes[0], denominator: 2 ** bytes[1] });
      } else if (metaType === 0x03) {
        events.push({ tick, type: 'trackName', text: new TextDecoder('latin1').decode(bytes) });
      } else if (metaType === 0x01 || metaType === 0x06) {
        events.push({ tick, type: 'text', text: new TextDecoder('latin1').decode(bytes) });
      }
    } else if (status === 0xf0 || status === 0xf7) {
      const sysexLen = reader.vlq();
      reader.bytes(sysexLen);
    } else if (type === 0x90 || type === 0x80) {
      const note = reader.u8();
      const velocity = reader.u8();
      if (type === 0x90 && velocity > 0) {
        events.push({ tick, type: 'noteOn', note, velocity });
      } else {
        events.push({ tick, type: 'noteOff', note });
      }
    } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
      reader.bytes(2);
    } else if (type === 0xc0 || type === 0xd0) {
      reader.bytes(1);
    } else {
      // Unknown/corrupt status byte - bail out of this track safely.
      reader.pos = trackEnd;
      break;
    }
  }
  reader.pos = trackEnd;
  return events;
}

function buildDifficultyTrack(
  events: MidiEvent[],
  difficulty: DifficultyTrack['difficulty'],
  base: number,
  resolution: number,
  enhancedOpens: boolean,
  starPowerNote: number,
  sustainCutoffThreshold: number,
): DifficultyTrack {
  const noteMap = new Map<number, NoteEvent>();
  const active = new Map<number, number>(); // note number -> start tick
  const starPowerRanges: StarPowerPhrase[] = [];
  const solos: SoloSection[] = [];

  const forcedRanges: { start: number; end: number }[] = [];
  const tapRanges: { start: number; end: number }[] = [];

  for (const ev of events) {
    if (ev.type === 'noteOn') {
      active.set(ev.note!, ev.tick);
    } else if (ev.type === 'noteOff') {
      const start = active.get(ev.note!);
      if (start === undefined) continue;
      active.delete(ev.note!);
      const note = ev.note!;

      if (note === starPowerNote) {
        starPowerRanges.push({ tick: start, length: ev.tick - start });
        continue;
      }
      if (note === SOLO_NOTE) {
        solos.push({ tick: start, length: ev.tick - start });
        continue;
      }
      if (note === base + 5) {
        forcedRanges.push({ start, end: ev.tick });
        continue;
      }
      if (note === base + 6) {
        tapRanges.push({ start, end: ev.tick });
        continue;
      }
      if (!enhancedOpens && note === base - 1) {
        // legacy open note representation without ENHANCED_OPENS, ignore (rare)
        continue;
      }

      let fretNum: number | null = null;
      let isOpen = false;
      if (note >= base && note <= base + 4) {
        fretNum = note - base;
      } else if (enhancedOpens && note === base - 1) {
        isOpen = true;
      } else {
        continue; // not part of this difficulty (e.g. BRE/trill markers)
      }

      let n = noteMap.get(start);
      if (!n) {
        n = { tick: start, length: 0, frets: [], fretLengths: [], isOpen: false, isForced: false, isTap: false, isHopo: false };
        noteMap.set(start, n);
      }
      // .mid sustains at/below the cutoff threshold are treated as plain (non-sustain) notes -
      // this is .mid-specific (charters using a DAW often leave tiny unintentional lengths);
      // .chart has no such cutoff (confirmed against SightRead's midiconverter.cpp).
      const rawLength = ev.tick - start;
      const thisLength = rawLength <= sustainCutoffThreshold ? 0 : rawLength;
      if (isOpen) n.isOpen = true;
      else {
        n.frets.push(fretNum as Fret);
        n.fretLengths.push(thisLength);
      }
      n.length = Math.max(n.length, thisLength);
    }
  }

  const notes = Array.from(noteMap.values()).sort((a, b) => a.tick - b.tick);
  for (const n of notes) {
    if (forcedRanges.some((r) => n.tick >= r.start && n.tick < r.end)) n.isForced = true;
    if (tapRanges.some((r) => n.tick >= r.start && n.tick < r.end)) n.isTap = true;
  }

  starPowerRanges.sort((a, b) => a.tick - b.tick);
  solos.sort((a, b) => a.tick - b.tick);
  resolveHopos(notes, resolution, 'mid');

  return { difficulty, notes, starPower: starPowerRanges, solos };
}

export interface MidParseOptions {
  /** song.ini `multiplier_note` / `star_power_note` override (default: 116). */
  starPowerNoteOverride?: number;
  /** song.ini `sustain_cutoff_threshold` override, in ticks (default: resolution/3). */
  sustainCutoffThresholdOverride?: number;
}

export function parseMidFile(buffer: ArrayBuffer, options: MidParseOptions = {}): ParsedChart {
  const view = new DataView(buffer);
  const reader = new ByteReader(view);

  const headerMagic = String.fromCharCode(reader.u8(), reader.u8(), reader.u8(), reader.u8());
  if (headerMagic !== 'MThd') throw new Error('Not a valid MIDI file (missing MThd header)');
  const headerLen = reader.u32();
  const headerStart = reader.pos;
  reader.u16(); // format (0/1/2) - not needed, we handle all tracks uniformly
  const numTracks = reader.u16();
  const division = reader.u16();
  reader.pos = headerStart + headerLen;

  if (division & 0x8000) {
    throw new Error('SMPTE time division is not supported');
  }
  const resolution = division;
  const starPowerNote = options.starPowerNoteOverride ?? DEFAULT_STAR_POWER_NOTE;
  // .mid sustains at/below a cutoff are supposed to be treated as plain notes (filters DAW
  // export artifacts). The exact default threshold Clone Hero itself uses is not reliably
  // confirmed (community tooling sources disagree, and a naive default risks UNDER-counting
  // the true maximum, which must never happen for a "max possible score" calculator) - so we
  // only apply a cutoff when a chart explicitly declares one via song.ini's
  // `sustain_cutoff_threshold`, and otherwise count every nonzero sustain as-is.
  const sustainCutoffThreshold = options.sustainCutoffThresholdOverride ?? 0;

  const tracks: MidiEvent[][] = [];
  for (let i = 0; i < numTracks; i++) {
    if (reader.pos >= reader.length) break;
    tracks.push(readTrack(reader));
  }

  const tempos: TempoEvent[] = [];
  const timeSigs: TimeSigEvent[] = [];
  // Tempo/time-sig live in track 0 for format 1, but scan all tracks defensively.
  for (const track of tracks) {
    for (const ev of track) {
      if (ev.type === 'tempo') tempos.push({ tick: ev.tick, usPerQuarter: ev.usPerQuarter! });
      else if (ev.type === 'timeSig') timeSigs.push({ tick: ev.tick, numerator: ev.numerator!, denominator: ev.denominator! });
    }
  }
  if (tempos.length === 0 || tempos[0].tick !== 0) tempos.unshift({ tick: 0, usPerQuarter: 500000 });
  if (timeSigs.length === 0 || timeSigs[0].tick !== 0) timeSigs.unshift({ tick: 0, numerator: 4, denominator: 4 });
  tempos.sort((a, b) => a.tick - b.tick);
  timeSigs.sort((a, b) => a.tick - b.tick);

  const instruments: InstrumentCharts[] = [];
  let lastTick = 0;
  let songName: string | undefined;

  for (const track of tracks) {
    const nameEvent = track.find((e) => e.type === 'trackName');
    const trackName = nameEvent?.text?.trim();
    if (!trackName) continue;
    if (trackName === 'Ratatata' || (!songName && track === tracks[0])) {
      // first track name in format-1 files is conventionally the song/sequence name
      if (!TRACK_NAME_TO_INSTRUMENT[trackName]) songName = trackName;
    }
    const instrumentKey = TRACK_NAME_TO_INSTRUMENT[trackName];
    if (!instrumentKey) continue;

    const enhancedOpens = track.some(
      (e) => e.type === 'text' && /ENHANCED_OPENS/i.test(e.text ?? ''),
    );

    // GH1/2-era compatibility: if this track has no modern SP phrases (note 116) at all, solo
    // markers (note 103) should be treated as Star Power instead - but only when the chart
    // author hasn't explicitly picked a note via multiplier_note/star_power_note in song.ini.
    let effectiveStarPowerNote = starPowerNote;
    if (options.starPowerNoteOverride === undefined) {
      const hasModernSp = track.some((e) => e.type === 'noteOn' && e.note === DEFAULT_STAR_POWER_NOTE);
      const hasSoloMarkers = track.some((e) => e.type === 'noteOn' && e.note === SOLO_NOTE);
      if (!hasModernSp && hasSoloMarkers) effectiveStarPowerNote = SOLO_NOTE;
    }

    const difficulties: InstrumentCharts['difficulties'] = {};
    for (const { difficulty, base } of DIFF_BASE_NOTES) {
      const diffTrack = buildDifficultyTrack(
        track,
        difficulty,
        base,
        resolution,
        enhancedOpens,
        effectiveStarPowerNote,
        sustainCutoffThreshold,
      );
      if (diffTrack.notes.length > 0) difficulties[difficulty] = diffTrack;
      for (const n of diffTrack.notes) lastTick = Math.max(lastTick, n.tick + n.length);
      for (const s of diffTrack.starPower) lastTick = Math.max(lastTick, s.tick + s.length);
    }
    if (Object.keys(difficulties).length > 0) {
      instruments.push({ instrument: instrumentKey, difficulties });
    }
  }

  return {
    formatSource: 'mid',
    name: songName,
    resolution,
    tempos,
    timeSigs,
    instruments,
    lastTick,
  };
}
