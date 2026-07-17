import type { DifficultyTrack, DrumDifficultyTrack, DrumNoteEvent, Fret, NoteEvent } from '../model/chart';
import { DRUM_POINTS_PER_NOTE, DRUM_CYMBAL_POINTS_PER_NOTE, DRUM_DYNAMICS_BONUS_PER_NOTE } from './score';

/**
 * Clone Hero's own kick-related score *modifiers* for Drums/Pro Drums (there are ~20 modifiers
 * in total - see AssumptionsPanel - these are the only two confirmed, via the real score API, to
 * change the scored note set rather than just the ruleset/assists):
 * - `none`: the default chart - "Expert+"/2x-kick alternate notes are excluded (see below).
 * - `doubleKick`: adds the "Expert+"/2x-kick alternate notes into the scored set as regular kick
 *   hits (confirmed: a real chart with such notes shows a HIGHER `noteCount` under this modifier
 *   than the default; a chart with none shows the identical count either way).
 * - `noKick`: removes every kick-lane note entirely (confirmed via a real chart's exact point
 *   math: `noteCount` dropped by exactly its kick-note count, and `baseScore` dropped by exactly
 *   that count × 50 points).
 */
export type DrumScoreModifier = 'none' | 'doubleKick' | 'noKick';

/**
 * Adapts a DrumDifficultyTrack into the guitar-shaped DifficultyTrack model so the existing,
 * verified scoring/optimizer engine (score.ts, optimizer.ts) can be reused unchanged for drums.
 * Drum notes at the same tick (a "chord" - e.g. kick+snare together) are grouped into one
 * NoteEvent with multiple frets, exactly like a guitar chord, so the combo/multiplier count
 * advances once per drum hit rather than once per pad (confirmed to make negligible difference
 * either way on a real chart, since combo tier saturates at 4x quickly regardless).
 *
 * "Expert+"/2x-kick alternate notes (`isDoubleKick`) are excluded by default - a real leaderboard
 * capture confirmed these are NOT part of the default scored chart at all (the displayed note
 * total and every real player's accuracy denominator excludes them); they only become playable
 * under Clone Hero's separate "Double Kick" score modifier (`DrumScoreModifier`, above), which
 * this function now models directly rather than always excluding them.
 *
 * Drums have no sustains, so `length` is always 0 - which also means the optimizer's
 * whammy-gauge-fill logic naturally contributes nothing, leaving pure phrase-based gauge filling
 * (there is no drum equivalent of guitar whammy). Lane-specific rendering detail (ghost/accent,
 * double-kick) is NOT preserved here - see DrumHighway, which reads the original
 * DrumDifficultyTrack directly for that.
 *
 * Each fret's point value (`fretPoints`, see NoteEvent) is `DRUM_CYMBAL_POINTS_PER_NOTE` for a
 * cymbal hit or `DRUM_POINTS_PER_NOTE` otherwise - the one piece of cymbal-vs-tom detail that
 * *is* preserved here, since it changes score.ts's point total (confirmed against a real
 * leaderboard score breakdown - see score.ts). Ghost/accent hits additionally get a flat,
 * unmultiplied `DRUM_DYNAMICS_BONUS_PER_NOTE` via `fretCleanPlayBonus` (also confirmed against a
 * real breakdown - see score.ts); a note can be ghost or accent but not both, so this never
 * double-counts.
 */
export function drumTrackToDifficultyTrack(track: DrumDifficultyTrack, modifier: DrumScoreModifier = 'none'): DifficultyTrack {
  const byTick = new Map<number, DrumNoteEvent[]>();
  for (const note of track.notes) {
    if (modifier === 'noKick' && note.lane === 0) continue;
    if (modifier !== 'doubleKick' && note.isDoubleKick) continue;
    if (!byTick.has(note.tick)) byTick.set(note.tick, []);
    byTick.get(note.tick)!.push(note);
  }

  const notes: NoteEvent[] = [...byTick.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tick, hits]) => ({
      tick,
      length: 0,
      frets: hits.map((h) => h.lane as Fret),
      fretLengths: hits.map(() => 0),
      isOpen: false,
      isForced: false,
      isTap: false,
      isHopo: false,
      fretPoints: hits.map((h) => (h.isCymbal ? DRUM_CYMBAL_POINTS_PER_NOTE : DRUM_POINTS_PER_NOTE)),
      fretCleanPlayBonus: hits.map((h) => (h.isGhost || h.isAccent ? DRUM_DYNAMICS_BONUS_PER_NOTE : 0)),
    }));

  return {
    difficulty: track.difficulty,
    notes,
    starPower: track.starPower,
    solos: track.solos,
  };
}

/** Note count matching Clone Hero's own displayed total for a given modifier - see `DrumScoreModifier`. */
export function countScoredDrumNotes(track: DrumDifficultyTrack, modifier: DrumScoreModifier = 'none'): number {
  return track.notes.filter((n) => {
    if (modifier === 'noKick' && n.lane === 0) return false;
    if (modifier !== 'doubleKick' && n.isDoubleKick) return false;
    return true;
  }).length;
}
