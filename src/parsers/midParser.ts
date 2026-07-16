import type {
  DifficultyTrack,
  DrumDifficultyTrack,
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
import { parseDrumTrack } from './midDrumParser';

const TRACK_NAME_TO_INSTRUMENT: Record<string, string> = {
  'PART GUITAR': 'Single',
  'PART GUITAR COOP': 'DoubleGuitar',
  'PART BASS': 'DoubleBass',
  'PART RHYTHM': 'DoubleRhythm',
  'PART KEYS': 'Keyboard',
  'T1 GEMS': 'Single', // very old RB1-era naming fallback
};

/** Lead/harmony vocals - lyrics-display only, not a playable/scored instrument in Clone Hero. */
const NON_SCOREABLE_TRACKS = /^PART (VOCALS|HARM[123]?)$/i;

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

/**
 * Forced/tap marker resolution (confirmed against real leaderboard hash captures - see
 * AssumptionsPanel):
 * - base+6 always means "forced" (flips the natural strum/HOPO determination).
 * - base+5 means "tap" when its range spans more than one note - a genuine tap *section* - but
 *   when it spans exactly one note (a ~30-tick blip matching just that note's own duration) it
 *   behaves like "forced" instead: a single isolated tap note is mechanically indistinguishable
 *   from a forced HOPO, and the game appears to resolve it the same way.
 * - A tap *section* (base+5, multi-note range) is only ever authored on the Expert difficulty,
 *   but applies to every difficulty of the track - i.e. it cascades to a lower difficulty
 *   wherever that difficulty has no local marker of its own at the same tick. Single-note
 *   "forced" blips (whether base+5 or base+6) never cascade - they only affect the difficulty
 *   that owns them.
 */
const EXPERT_BASE = 96;
const SINGLE_NOTE_MARKER_TICKS = 100; // longer than any real single-note blip, shorter than any real tap section

type MarkerRange = { start: number; end: number; kind: 'five' | 'six' };

function collectMarkerRanges(events: MidiEvent[], base: number): MarkerRange[] {
  const active = new Map<number, number>();
  const ranges: MarkerRange[] = [];
  for (const ev of events) {
    if (ev.type === 'noteOn') {
      active.set(ev.note!, ev.tick);
    } else if (ev.type === 'noteOff') {
      const start = active.get(ev.note!);
      if (start === undefined) continue;
      active.delete(ev.note!);
      if (ev.note === base + 5) ranges.push({ start, end: ev.tick, kind: 'five' });
      else if (ev.note === base + 6) ranges.push({ start, end: ev.tick, kind: 'six' });
    }
  }
  return ranges;
}

function resolveMarker(tick: number, ownRanges: MarkerRange[], expertRanges: MarkerRange[], isExpert: boolean): { isForced: boolean; isTap: boolean } {
  // A cascaded tap *section* takes priority over a same-tick single-note "forced" blip (own or
  // cascaded) - the section reflects deliberate authoring across the whole passage, while a
  // coincidental short marker inside it doesn't override that (confirmed via real captures: a
  // difficulty's own short blip landing inside Expert's long tap span still resolves as tap).
  if (!isExpert) {
    const cascaded = expertRanges.find(
      (r) => r.kind === 'five' && r.end - r.start > SINGLE_NOTE_MARKER_TICKS && tick >= r.start && tick < r.end,
    );
    if (cascaded) return { isForced: false, isTap: true };
  }
  const own = ownRanges.find((r) => tick >= r.start && tick < r.end);
  if (own) {
    if (own.kind === 'six') return { isForced: true, isTap: false };
    const isSection = own.end - own.start > SINGLE_NOTE_MARKER_TICKS;
    return isSection ? { isForced: false, isTap: true } : { isForced: true, isTap: false };
  }
  return { isForced: false, isTap: false };
}

function buildDifficultyTrack(
  events: MidiEvent[],
  difficulty: DifficultyTrack['difficulty'],
  base: number,
  resolution: number,
  enhancedOpens: boolean,
  starPowerNote: number,
  sustainCutoffThreshold: number,
  ownMarkerRanges: MarkerRange[],
  expertMarkerRanges: MarkerRange[],
): DifficultyTrack {
  const noteMap = new Map<number, NoteEvent>();
  const active = new Map<number, number>(); // note number -> start tick
  const starPowerRanges: StarPowerPhrase[] = [];
  const solos: SoloSection[] = [];

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
      if (note === base + 5 || note === base + 6) {
        continue; // handled separately by collectMarkerRanges/resolveMarker
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
  const isExpert = base === EXPERT_BASE;
  for (const n of notes) {
    const { isForced, isTap } = resolveMarker(n.tick, ownMarkerRanges, expertMarkerRanges, isExpert);
    n.isForced = isForced;
    n.isTap = isTap;
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
  const unsupportedInstruments = new Set<string>();
  let drums: Partial<Record<DrumDifficultyTrack['difficulty'], DrumDifficultyTrack>> | undefined;
  let lastTick = 0;
  let songName: string | undefined;

  for (const track of tracks) {
    const nameEvent = track.find((e) => e.type === 'trackName');
    const trackName = nameEvent?.text?.trim();
    if (!trackName) continue;
    if (!songName && track === tracks[0]) {
      // first track name in format-1 files is conventionally the song/sequence name
      if (!TRACK_NAME_TO_INSTRUMENT[trackName]) songName = trackName;
    }
    if (trackName === 'PART DRUMS') {
      const parsed = parseDrumTrack(track);
      if (Object.keys(parsed).length > 0) {
        drums = parsed;
        for (const diffTrack of Object.values(parsed)) {
          for (const n of diffTrack!.notes) lastTick = Math.max(lastTick, n.tick);
          for (const s of diffTrack!.starPower) lastTick = Math.max(lastTick, s.tick + s.length);
        }
      }
      continue;
    }
    if (NON_SCOREABLE_TRACKS.test(trackName)) {
      // Clone Hero doesn't support playable/scored vocals - lead or harmony vocal tracks only
      // ever drive the on-screen scrolling lyrics. Confirmed via a real leaderboard hash capture
      // of a chart with a charted "PART VOCALS" track (song.ini `diff_vocals` >= 0): the
      // resulting SongHash's entry list had no vocals entry at all, so - unlike every other
      // unparsed "PART ..." track - this one doesn't need to block the leaderboard link.
      continue;
    }
    const instrumentKey = TRACK_NAME_TO_INSTRUMENT[trackName];
    if (!instrumentKey) {
      // Any other "PART ..." track (pro-instrument tracks, GHL rhythm/co-op, ...) is a real,
      // charted instrument this app doesn't parse - see ParsedChart.unsupportedInstruments.
      if (/^PART /i.test(trackName)) unsupportedInstruments.add(trackName);
      continue;
    }

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

    const expertMarkerRanges = collectMarkerRanges(track, EXPERT_BASE);
    const difficulties: InstrumentCharts['difficulties'] = {};
    for (const { difficulty, base } of DIFF_BASE_NOTES) {
      const ownMarkerRanges = base === EXPERT_BASE ? expertMarkerRanges : collectMarkerRanges(track, base);
      const diffTrack = buildDifficultyTrack(
        track,
        difficulty,
        base,
        resolution,
        enhancedOpens,
        effectiveStarPowerNote,
        sustainCutoffThreshold,
        ownMarkerRanges,
        expertMarkerRanges,
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
    unsupportedInstruments: Array.from(unsupportedInstruments),
    drums,
  };
}
