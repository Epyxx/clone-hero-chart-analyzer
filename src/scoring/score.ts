import type { DifficultyTrack, NoteEvent } from '../model/chart';

export const BASE_POINTS_PER_NOTE = 50;
export const SUSTAIN_POINTS_PER_BEAT = 25;
export const SOLO_MAX_BONUS_PER_NOTE = 100;
/**
 * Clone Hero's "clean play" bonus: a flat +2 points per note-event (chord
 * counts once - or +2 per fret for a "disjoint" chord, see below), granted
 * whenever the note is hit cleanly (no ghosting) - always true for the
 * perfect-play "max score" we calculate. This is NOT affected by the
 * combo/star-power multiplier (confirmed against CHOpt's engine source:
 * ChGuitarEngine.clean_play_bonus() = 2, applied outside the multiplier
 * step).
 */
export const CLEAN_PLAY_BONUS_PER_NOTE = 2;

/**
 * Drum scoring constants - UNLIKE every other value in this file, these are
 * NOT verified against real gameplay or engine source, but ARE confirmed
 * against real leaderboard scores' own point breakdowns, pulled directly
 * from Clone Hero's score API (`noteScore`/`comboScore`/`spScore`/etc. as
 * separate fields, not just a final total - see AssumptionsPanel for the
 * endpoint). Kick/snare/tom notes score the same 50 points as a guitar note
 * (an initial guess of 25 - half a guitar note, an older GH/RB convention -
 * was too low: a real #1 leaderboard score exceeded the calculated max at
 * 25/note, which can never happen for a true maximum).
 *
 * Cymbal hits score MORE: decomposing a real #1 score's exact `noteScore`
 * value (85,450, for 968 non-cymbal + 570 cymbal hits out of 1,539 notes)
 * only balances at 50/cymbal-hit=65 - confirmed to the exact point.
 *
 * Ghost/accent notes hit with the correct dynamic score an EXTRA flat,
 * unmultiplied 50 points each (`fretCleanPlayBonus` in drumAdapter.ts) -
 * found because 5 of 6 real scores with nonzero `ghostsHit`/`accentsHit`
 * had a `totalScore` that exceeded the sum of every one of their own named
 * breakdown fields by *exactly* 50 points per such hit (the 6th was
 * internally inconsistent in a way unrelated to this - its `comboScore`
 * field read 0 despite a large `maxCombo`, so it was treated as a bad
 * record rather than evidence against the pattern). The bonus itself isn't
 * broken out under any of the API's named fields (not even the confusingly
 * name-matched `ghostScore`, which reads 0 in every real example checked,
 * regardless of `ghostsHit` count) - it's only visible as a gap between the
 * total and the sum of the parts.
 *
 * With cymbal points, the ghost/accent bonus, and the "Expert+"/2x-kick
 * exclusion (see drumAdapter.ts) combined, a real chart's calculated
 * full-combo max lands comfortably above a real near-full-combo score - the
 * expected pattern, and the strongest evidence yet this formula is close to
 * correct. Solo bonus is still a guess (guitar's value, carried over),
 * unconfirmed either way since no drum chart with a solo section has been
 * checked against a real score yet.
 */
export const DRUM_POINTS_PER_NOTE = BASE_POINTS_PER_NOTE;
export const DRUM_CYMBAL_POINTS_PER_NOTE = 65;
export const DRUM_CLEAN_PLAY_BONUS_PER_NOTE = 0;
export const DRUM_DYNAMICS_BONUS_PER_NOTE = 50;
export const DRUM_SOLO_BONUS_PER_NOTE = 100;

export interface ScoreTrackOptions {
  pointsPerNote?: number;
  cleanPlayBonusPerNote?: number;
  soloBonusPerNote?: number;
}

/**
 * Sustains are not scored as a continuous rate. The engine divides each
 * sustain into discrete "ticks" spaced `tickGap` chart-ticks apart (each
 * worth 1 point pre-multiplier), where `tickGap = floor(resolution / 25)`
 * (rounded DOWN - CH's `round_tick_gap` engine flag), and the total number of
 * ticks is `ceil(length / tickGap)` (CH's `RoundUp` sustain rounding policy).
 * This is confirmed against CHOpt's engine.hpp/points.cpp source and matches
 * real in-game scores exactly (verified against Clone Hero directly).
 */
function sustainTickGap(resolution: number): number {
  return Math.max(1, Math.floor(resolution / SUSTAIN_POINTS_PER_BEAT));
}

function sustainTicksBudget(length: number, resolution: number): number {
  if (length <= 0) return 0;
  return Math.ceil(length / sustainTickGap(resolution));
}

export interface SustainSegment {
  start: number;
  end: number;
  rate: number; // tier-weighted points per tick, pre-SP
}

export interface NoteScoreInfo {
  note: NoteEvent;
  tier: number; // 1-4, based on combo streak (not including star power)
  hitPoints: number; // tier * 50 * chordSize, pre-SP
  /**
   * One segment per sustain contribution. Almost always a single segment
   * (the whole chord holds one merged length - CH does not multiply sustain
   * points by chord size: `chords_multiply_sustains = false`). A "disjoint"
   * chord (frets with different sustain lengths) instead gets one segment
   * PER FRET, each scored independently and not deduplicated even if two
   * frets happen to share the same length (`merge_uneven_sustains = false`)
   * - confirmed against CHOpt's points.cpp `append_note_points`.
   */
  sustainSegments: SustainSegment[];
  sustainBasePoints: number; // sum of sustainSegments' point totals
}

export interface ScoredTrack {
  notes: NoteScoreInfo[];
  /** Total score assuming Star Power is NEVER activated (tier multiplier only). */
  baseScoreNoStarPower: number;
  soloBonus: number;
  /** Flat +2/note bonus (more for disjoint chords), never multiplied by combo or star power. */
  cleanPlayBonus: number;
  resolution: number;
}

function comboTier(comboCountAfterThisNote: number): number {
  // Matches CHOpt/Clone Hero exactly: multiplier reaches 2x AT the 10th note
  // (not the 11th), 3x at the 20th, 4x at the 30th.
  return Math.min(4, Math.floor(comboCountAfterThisNote / 10) + 1);
}

export function scoreTrackBase(track: DifficultyTrack, resolution: number, options: ScoreTrackOptions = {}): ScoredTrack {
  const pointsPerNote = options.pointsPerNote ?? BASE_POINTS_PER_NOTE;
  const cleanPlayBonusPerNote = options.cleanPlayBonusPerNote ?? CLEAN_PLAY_BONUS_PER_NOTE;
  const soloBonusPerNote = options.soloBonusPerNote ?? SOLO_MAX_BONUS_PER_NOTE;

  const notes: NoteScoreInfo[] = [];
  let baseScoreNoStarPower = 0;
  let cleanPlayBonus = 0;

  track.notes.forEach((note, i) => {
    const tier = comboTier(i + 1);
    const chordSize = note.isOpen ? 1 : Math.max(1, note.frets.length);
    const rawPoints = note.fretPoints ? note.fretPoints.reduce((sum, p) => sum + p, 0) : pointsPerNote * chordSize;
    const hitPoints = tier * rawPoints;

    const isDisjoint = !note.isOpen && note.fretLengths.length > 1 && new Set(note.fretLengths).size > 1;

    const sustainSegments: SustainSegment[] = [];
    if (isDisjoint) {
      // Each fret's own sustain length is scored independently (not deduplicated even if two
      // frets share a length) - matches CH's `merge_uneven_sustains = false` behaviour.
      for (const fretLength of note.fretLengths) {
        if (fretLength <= 0) continue;
        const ticksBudget = sustainTicksBudget(fretLength, resolution);
        const points = tier * ticksBudget;
        sustainSegments.push({ start: note.tick, end: note.tick + fretLength, rate: points / fretLength });
      }
    } else if (note.length > 0) {
      const ticksBudget = sustainTicksBudget(note.length, resolution);
      const points = tier * ticksBudget;
      sustainSegments.push({ start: note.tick, end: note.tick + note.length, rate: points / note.length });
    }

    const sustainBasePoints = sustainSegments.reduce((sum, seg) => sum + seg.rate * (seg.end - seg.start), 0);

    notes.push({ note, tier, hitPoints, sustainSegments, sustainBasePoints });
    baseScoreNoStarPower += hitPoints + sustainBasePoints;
    cleanPlayBonus += note.fretCleanPlayBonus
      ? note.fretCleanPlayBonus.reduce((sum, b) => sum + b, 0)
      : cleanPlayBonusPerNote * (isDisjoint ? chordSize : 1);
  });

  let soloBonus = 0;
  for (const solo of track.solos) {
    const count = track.notes.filter((n) => n.tick >= solo.tick && n.tick < solo.tick + solo.length).length;
    soloBonus += count * soloBonusPerNote;
  }

  return { notes, baseScoreNoStarPower, soloBonus, cleanPlayBonus, resolution };
}

/**
 * Fast range-query structure over a ScoredTrack: given [a, b) in ticks, returns
 * the total tier-weighted (pre star-power) points falling in that range - i.e.
 * exactly the bonus that doubling (via Star Power) would add for that window.
 * Note: the clean-play bonus is intentionally excluded here since it is never
 * doubled by Star Power.
 *
 * Sustain segments are integrated via a rate-delta sweep (like a mini gauge
 * timeline) rather than assumed non-overlapping, since a disjoint chord's
 * per-fret segments all start at the same tick and legitimately overlap.
 */
export class ScoreRangeIndex {
  private hitTicks: number[];
  private hitCumulative: number[];
  private sustainEventTicks: number[];
  private sustainCumulativeArea: number[];
  private sustainRateAfter: number[];

  constructor(scored: ScoredTrack) {
    const sortedByTick = [...scored.notes].sort((a, b) => a.note.tick - b.note.tick);

    this.hitTicks = sortedByTick.map((n) => n.note.tick);
    this.hitCumulative = [];
    let cum = 0;
    for (const n of sortedByTick) {
      cum += n.hitPoints;
      this.hitCumulative.push(cum);
    }

    const rateDeltaByTick = new Map<number, number>();
    for (const n of scored.notes) {
      for (const seg of n.sustainSegments) {
        rateDeltaByTick.set(seg.start, (rateDeltaByTick.get(seg.start) ?? 0) + seg.rate);
        rateDeltaByTick.set(seg.end, (rateDeltaByTick.get(seg.end) ?? 0) - seg.rate);
      }
    }
    const ticks = Array.from(rateDeltaByTick.keys()).sort((a, b) => a - b);
    this.sustainEventTicks = [];
    this.sustainCumulativeArea = [];
    this.sustainRateAfter = [];
    let area = 0;
    let rate = 0;
    let lastTick = ticks[0] ?? 0;
    for (const tick of ticks) {
      area += rate * (tick - lastTick);
      rate += rateDeltaByTick.get(tick)!;
      this.sustainEventTicks.push(tick);
      this.sustainCumulativeArea.push(area);
      this.sustainRateAfter.push(rate);
      lastTick = tick;
    }
  }

  private hitPointsBefore(tick: number): number {
    // sum of hitPoints for notes with note.tick < tick
    let lo = 0;
    let hi = this.hitTicks.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.hitTicks[mid] < tick) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return idx === -1 ? 0 : this.hitCumulative[idx];
  }

  private sustainAreaBefore(tick: number): number {
    if (this.sustainEventTicks.length === 0) return 0;
    // find last event at/before tick
    let lo = 0;
    let hi = this.sustainEventTicks.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.sustainEventTicks[mid] <= tick) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx === -1) return 0;
    return this.sustainCumulativeArea[idx] + this.sustainRateAfter[idx] * (tick - this.sustainEventTicks[idx]);
  }

  /** Tier-weighted (pre-SP) points strictly within [a, b). */
  scoreInRange(a: number, b: number): number {
    if (b <= a) return 0;
    const hit = this.hitPointsBefore(b) - this.hitPointsBefore(a);
    const sustain = this.sustainAreaBefore(b) - this.sustainAreaBefore(a);
    return hit + sustain;
  }
}
