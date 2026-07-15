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

const DIFF_PREFIXES: Record<string, DifficultyTrack['difficulty']> = {
  Easy: 'Easy',
  Medium: 'Medium',
  Hard: 'Hard',
  Expert: 'Expert',
};

const INSTRUMENT_SUFFIXES = ['Single', 'DoubleGuitar', 'DoubleBass', 'DoubleRhythm', 'Keyboard', 'GHLGuitar', 'GHLBass'];

function splitSections(text: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  const lines = text.split(/\r?\n/);
  let current: string | null = null;
  let buffer: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      current = line.slice(1, -1);
      buffer = [];
      sections.set(current, buffer);
      continue;
    }
    if (line === '{' || line === '}' || line === '') continue;
    if (current) buffer.push(line);
  }
  return sections;
}

function parseKeyValue(line: string): { key: string; value: string } | null {
  const idx = line.indexOf('=');
  if (idx === -1) return null;
  return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
}

interface SongSection {
  resolution: number;
  name?: string;
  artist?: string;
  charter?: string;
  album?: string;
  genre?: string;
  year?: string;
}

function parseSong(lines: string[]): SongSection {
  let resolution = 192;
  const out: SongSection = { resolution: 192 };
  for (const line of lines) {
    const kv = parseKeyValue(line);
    if (!kv) continue;
    const val = kv.value.replace(/^"|"$/g, '');
    if (kv.key === 'Resolution') resolution = parseInt(val, 10);
    else if (kv.key === 'Name') out.name = val;
    else if (kv.key === 'Artist') out.artist = val;
    else if (kv.key === 'Charter' || kv.key === 'Charterer') out.charter = val;
    else if (kv.key === 'Album') out.album = val;
    else if (kv.key === 'Genre') out.genre = val;
    else if (kv.key === 'Year') out.year = val.replace(/^,\s*/, '');
  }
  out.resolution = resolution;
  return out;
}

function parseSyncTrack(lines: string[]): { tempos: TempoEvent[]; timeSigs: TimeSigEvent[] } {
  const tempos: TempoEvent[] = [];
  const timeSigs: TimeSigEvent[] = [];
  for (const line of lines) {
    const kv = parseKeyValue(line);
    if (!kv) continue;
    const tick = parseInt(kv.key, 10);
    const parts = kv.value.split(/\s+/);
    const type = parts[0];
    if (type === 'B') {
      tempos.push({ tick, usPerQuarter: 60_000_000 / (parseInt(parts[1], 10) / 1000) });
    } else if (type === 'TS') {
      const numerator = parseInt(parts[1], 10);
      const denomPow = parts[2] !== undefined ? parseInt(parts[2], 10) : 2;
      timeSigs.push({ tick, numerator, denominator: 2 ** denomPow });
    }
  }
  if (tempos.length === 0 || tempos[0].tick !== 0) tempos.unshift({ tick: 0, usPerQuarter: 500000 });
  if (timeSigs.length === 0 || timeSigs[0].tick !== 0) timeSigs.unshift({ tick: 0, numerator: 4, denominator: 4 });
  tempos.sort((a, b) => a.tick - b.tick);
  timeSigs.sort((a, b) => a.tick - b.tick);
  return { tempos, timeSigs };
}

function parseDifficultyTrack(lines: string[], difficulty: DifficultyTrack['difficulty']): DifficultyTrack {
  const noteMap = new Map<number, NoteEvent>();
  const starPower: StarPowerPhrase[] = [];
  const solos: SoloSection[] = [];
  let soloStart: number | null = null;
  const forcedTicks = new Set<number>();
  const tapTicks = new Set<number>();

  for (const line of lines) {
    const kv = parseKeyValue(line);
    if (!kv) continue;
    const tick = parseInt(kv.key, 10);
    const parts = kv.value.split(/\s+/).filter(Boolean);
    const type = parts[0];
    if (type === 'N') {
      const fretNum = parseInt(parts[1], 10);
      const length = parseInt(parts[2], 10);
      if (fretNum === 5) {
        forcedTicks.add(tick);
        continue;
      }
      if (fretNum === 6) {
        tapTicks.add(tick);
        continue;
      }
      let note = noteMap.get(tick);
      if (!note) {
        note = { tick, length: 0, frets: [], fretLengths: [], isOpen: false, isForced: false, isTap: false, isHopo: false };
        noteMap.set(tick, note);
      }
      if (fretNum === 7) {
        note.isOpen = true;
      } else {
        note.frets.push(fretNum as Fret);
        note.fretLengths.push(length);
      }
      note.length = Math.max(note.length, length);
    } else if (type === 'S') {
      const spType = parseInt(parts[1], 10);
      const length = parseInt(parts[2], 10);
      if (spType === 2) starPower.push({ tick, length });
    } else if (type === 'E') {
      const text = parts.slice(1).join(' ').replace(/^"|"$/g, '');
      if (text === 'solo') soloStart = tick;
      else if (text === 'soloend' && soloStart !== null) {
        // .chart solo ranges are inclusive of a note landing exactly on the "soloend" tick
        // (confirmed against SightRead's form_solo_vector: `end += 1` for non-MIDI sources).
        solos.push({ tick: soloStart, length: tick - soloStart + 1 });
        soloStart = null;
      }
    }
  }

  for (const tick of forcedTicks) {
    const note = noteMap.get(tick);
    if (note) note.isForced = true;
  }
  for (const tick of tapTicks) {
    const note = noteMap.get(tick);
    if (note) note.isTap = true;
  }

  const notes = Array.from(noteMap.values()).sort((a, b) => a.tick - b.tick);
  starPower.sort((a, b) => a.tick - b.tick);
  solos.sort((a, b) => a.tick - b.tick);

  return { difficulty, notes, starPower, solos };
}

export function parseChartFile(text: string, resolutionHint?: number): ParsedChart {
  const sections = splitSections(text);
  const songLines = sections.get('Song') ?? [];
  const song = parseSong(songLines);
  const resolution = resolutionHint ?? song.resolution;

  const syncLines = sections.get('SyncTrack') ?? [];
  const { tempos, timeSigs } = parseSyncTrack(syncLines);

  const instrumentsMap = new Map<string, InstrumentCharts>();
  let lastTick = 0;

  for (const [sectionName, lines] of sections) {
    let matchedDiff: DifficultyTrack['difficulty'] | null = null;
    let matchedInstrument: string | null = null;
    for (const [prefix, diff] of Object.entries(DIFF_PREFIXES)) {
      if (sectionName.startsWith(prefix)) {
        const rest = sectionName.slice(prefix.length);
        if (INSTRUMENT_SUFFIXES.includes(rest)) {
          matchedDiff = diff;
          matchedInstrument = rest;
        }
      }
    }
    if (!matchedDiff || !matchedInstrument) continue;

    const track = parseDifficultyTrack(lines, matchedDiff);
    resolveHopos(track.notes, resolution);
    for (const n of track.notes) lastTick = Math.max(lastTick, n.tick + n.length);
    for (const s of track.starPower) lastTick = Math.max(lastTick, s.tick + s.length);

    let inst = instrumentsMap.get(matchedInstrument);
    if (!inst) {
      inst = { instrument: matchedInstrument, difficulties: {} };
      instrumentsMap.set(matchedInstrument, inst);
    }
    inst.difficulties[matchedDiff] = track;
  }

  return {
    formatSource: 'chart',
    name: song.name,
    artist: song.artist,
    charter: song.charter,
    album: song.album,
    genre: song.genre,
    year: song.year,
    resolution,
    tempos,
    timeSigs,
    instruments: Array.from(instrumentsMap.values()),
    lastTick,
  };
}
