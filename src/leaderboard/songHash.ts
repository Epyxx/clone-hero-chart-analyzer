import { blake3 } from '@noble/hashes/blake3.js';

// Verified byte-for-byte against real leaderboard hashes (see AssumptionsPanel).
const SONG_MAGIC = 'CHSH';
const SONG_VERSION = 20251010;

export const DIFFICULTY_ORDER = ['Expert', 'Hard', 'Medium', 'Easy'] as const;
export type LeaderboardDifficulty = (typeof DIFFICULTY_ORDER)[number];

/**
 * Instrument indices as used inside the hash. Only `guitar` (index 0) has been verified
 * against a real leaderboard hash; the rest follow Clone Hero's own track-name ordering
 * (mirrored from the community's `scan-chart` tool) but are unconfirmed - see AssumptionsPanel.
 */
export const INSTRUMENT_INDEX: Record<string, number> = {
  Single: 0, // guitar
  DoubleGuitar: 1, // guitarcoop
  DoubleRhythm: 2, // rhythm
  DoubleBass: 3, // bass
  Keyboard: 5, // keys (4 = drums, unsupported by this app)
  GHLGuitar: 6, // guitarghl
  GHLBass: 9, // bassghl
};

/** Query-string instrument name for the leaderboard URL (UI filter only, not part of the hash). */
export const INSTRUMENT_QUERY_NAME: Record<string, string> = {
  Single: 'guitar',
  DoubleGuitar: 'guitarcoop',
  DoubleRhythm: 'rhythm',
  DoubleBass: 'bass',
  Keyboard: 'keys',
  GHLGuitar: 'guitarghl',
  GHLBass: 'bassghl',
};

function u32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n >>> 0, true);
  return out;
}

function utf8Field(s: string): Uint8Array {
  const strBytes = new TextEncoder().encode(s);
  const out = new Uint8Array(4 + strBytes.length);
  new DataView(out.buffer).setUint32(0, strBytes.length, true);
  out.set(strBytes, 4);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export interface SongHashMetadata {
  name: string;
  artist: string;
  album: string;
  genre: string;
  year: string;
  songLengthMs: number;
  modchart: number;
  charter: string;
  icon: string;
}

export interface SongHashTrackEntry {
  instrumentIndex: number;
  difficultyIndex: number;
  trackHashRaw: Uint8Array;
}

export function buildSongHashBuffer(meta: SongHashMetadata, entries: SongHashTrackEntry[]): Uint8Array {
  const parts: Uint8Array[] = [
    new TextEncoder().encode(SONG_MAGIC),
    u32(SONG_VERSION),
    utf8Field(meta.name),
    utf8Field(meta.artist),
    utf8Field(meta.album),
    utf8Field(meta.genre),
    utf8Field(meta.year),
    u32(meta.songLengthMs),
    u32(meta.modchart),
    utf8Field(meta.charter),
    utf8Field(meta.icon),
    u32(entries.length),
  ];
  for (const entry of entries) {
    parts.push(u32(entry.instrumentIndex));
    parts.push(u32(entry.difficultyIndex));
    parts.push(entry.trackHashRaw);
  }
  return concat(parts);
}

function b64url(buf: Uint8Array): string {
  let binary = '';
  for (const byte of buf) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function computeSongHash(meta: SongHashMetadata, entries: SongHashTrackEntry[]): string {
  return b64url(blake3(buildSongHashBuffer(meta, entries)));
}
