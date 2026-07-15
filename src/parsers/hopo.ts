import type { NoteEvent } from '../model/chart';

/**
 * Resolves which notes are hammer-ons/pull-offs vs strums, for visualization only.
 * HOPO/strum/tap status does not affect scoring (base points are identical), so
 * this is a best-effort approximation of the in-game auto-HOPO behaviour.
 */
export function resolveHopos(notes: NoteEvent[], resolution: number, source: 'chart' | 'mid' = 'chart'): void {
  const threshold = source === 'chart' ? Math.floor((65 / 192) * resolution) : Math.floor(resolution / 3) + 1;

  let prev: NoteEvent | null = null;
  for (const note of notes) {
    const isChord = note.frets.length > 1;
    const sameShape =
      prev !== null &&
      !isChord &&
      prev.frets.length === 1 &&
      prev.frets[0] === note.frets[0] &&
      !note.isOpen &&
      !prev.isOpen;

    let natural = false;
    if (prev !== null && note.tick - prev.tick <= threshold && !isChord && !sameShape) {
      natural = true;
    }

    let isHopo = note.isForced ? !natural : natural;
    if (note.isTap) isHopo = true;

    note.isHopo = isHopo;
    prev = note;
  }
}
