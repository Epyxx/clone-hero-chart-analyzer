import type { DifficultyTrack, DrumDifficultyTrack, Fret, NoteEvent } from '../model/chart';

/**
 * Adapts a DrumDifficultyTrack into the guitar-shaped DifficultyTrack model so the existing,
 * verified scoring/optimizer engine (score.ts, optimizer.ts) can be reused unchanged for drums.
 * Drum notes at the same tick (a "chord" - e.g. kick+snare together) are grouped into one
 * NoteEvent with multiple frets, exactly like a guitar chord, so the combo/multiplier count
 * advances once per drum hit rather than once per pad. A double-kick hit is modelled as TWO
 * simultaneous kick "frets" (two pedals struck at once), scoring double - unverified, but this
 * is what makes the calculated max land just above a real #1 leaderboard score rather than
 * below it (see DRUM_POINTS_PER_NOTE). Drums have no sustains, so `length` is always 0 - which
 * also means the optimizer's whammy-gauge-fill logic naturally contributes nothing, leaving
 * pure phrase-based gauge filling (there is no drum equivalent of guitar whammy). Lane-specific
 * rendering detail (cymbal/tom, ghost/accent, double-kick) is NOT preserved here - see
 * DrumHighway, which reads the original DrumDifficultyTrack directly for that.
 */
export function drumTrackToDifficultyTrack(track: DrumDifficultyTrack): DifficultyTrack {
  const byTick = new Map<number, Fret[]>();
  for (const note of track.notes) {
    if (!byTick.has(note.tick)) byTick.set(note.tick, []);
    const frets = byTick.get(note.tick)!;
    frets.push(note.lane as Fret);
    if (note.lane === 0 && note.isDoubleKick) frets.push(note.lane as Fret);
  }

  const notes: NoteEvent[] = [...byTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, frets]) => ({
      tick,
      length: 0,
      frets,
      fretLengths: frets.map(() => 0),
      isOpen: false,
      isForced: false,
      isTap: false,
      isHopo: false,
    }));

  return {
    difficulty: track.difficulty,
    notes,
    starPower: track.starPower,
    solos: track.solos,
  };
}
