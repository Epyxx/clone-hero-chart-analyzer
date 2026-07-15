export interface SongIni {
  name?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: string;
  charter?: string;
  loadingPhrase?: string;
  icon?: string;
  songLengthMs?: number;
  previewStartMs?: number;
  delayMs?: number;
  multiplierNote?: number;
  hopoFrequency?: number;
  sustainCutoffThreshold?: number;
  eighthNoteHopo?: boolean;
  /** All diff_* tags (e.g. diff_guitar, diff_bass, diff_drums), -1 means "not charted". */
  difficulties: Record<string, number>;
  /** Every key=value pair as parsed, for anything not explicitly modelled above. */
  raw: Record<string, string>;
}

function toInt(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
}

export function parseSongIni(text: string): SongIni {
  const raw: Record<string, string> = {};
  const difficulties: Record<string, number> = {};
  let inSongSection = text.split(/\r?\n/).some((l) => l.trim().startsWith('['))
    ? false
    : true; // files without any [section] header: treat everything as the song section

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      inSongSection = line.slice(1, -1).toLowerCase() === 'song';
      continue;
    }
    if (!inSongSection) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    raw[key] = value;
    if (key.startsWith('diff_')) {
      const n = toInt(value);
      if (n !== undefined) difficulties[key] = n;
    }
  }

  return {
    name: raw['name'],
    artist: raw['artist'],
    album: raw['album'],
    genre: raw['genre'],
    year: raw['year'],
    charter: raw['charter'] ?? raw['frets'],
    loadingPhrase: raw['loading_phrase'],
    icon: raw['icon'],
    songLengthMs: toInt(raw['song_length']),
    previewStartMs: toInt(raw['preview_start_time']),
    delayMs: toInt(raw['delay']),
    multiplierNote: toInt(raw['multiplier_note']) ?? toInt(raw['star_power_note']),
    hopoFrequency: toInt(raw['hopo_frequency']),
    sustainCutoffThreshold: toInt(raw['sustain_cutoff_threshold']),
    eighthNoteHopo: raw['eighthnote_hopo'] === '1' || raw['eighthnote_hopo']?.toLowerCase() === 'true',
    difficulties,
    raw,
  };
}
