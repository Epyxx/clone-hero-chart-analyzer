import type { DifficultyTrack, StarPowerPhrase } from '../model/chart';
import type { TimingMap } from '../model/timing';
import { ScoreRangeIndex } from './score';
import type { ScoredTrack } from './score';

// --- Star Power gauge constants (see AssumptionsPanel for sources) ---
const GAUGE_UNITS_FULL = 120; // 1 unit = 1/120th of a full bar
const GAUGE_UNITS_PER_PHRASE = 30; // a fully-comboed phrase fills 1/4 of the bar
const GAUGE_UNITS_MIN_ACTIVATE = 60; // must be at least half full (1/2 bar) to activate
const GAUGE_UNITS_PER_QUARTER_WHAMMY = 4; // 1/30th of the bar per quarter note of whammy
const MEASURES_PER_FULL_BAR = 8; // a full bar of SP lasts 8 measures
const GAUGE_ROUNDING = 4; // discretize the DP's gauge dimension to steps of 1/4 unit
// While active, the gauge continuously drains at a rate that empties a full bar (120 units)
// over exactly 8 measures - i.e. 120/8 = 15 units per measure - regardless of whammying.
const DRAIN_UNITS_PER_MEASURE_WHILE_ACTIVE = GAUGE_UNITS_FULL / MEASURES_PER_FULL_BAR;
// "Early whammy": a SP-sustain note can be hit up to this long before its own tick (within the
// normal ~70ms hit window) and whammied from that earlier point on, gaining a small head start
// (CH engine: has_early_whammy = true, fixed 70ms hit window for the standard timing profile).
const EARLY_WHAMMY_SECONDS = 0.07;

interface WhammySegment {
  start: number;
  end: number;
}

/**
 * A note counts as "in" an SP phrase purely by whether its START tick falls inside the
 * phrase's [start, end) range - confirmed against CHOpt's `is_note_part_of_phrase`. Once a
 * note qualifies, its FULL sustain length is whammy-able for gauge gain, even past the
 * phrase's own end tick (the note is shown/colored as an SP note for its whole duration).
 * Each note is attributed to at most one phrase (its earliest-starting containing phrase),
 * matching CHOpt's std::upper_bound-based lookup, so densely-packed/overlapping phrases
 * don't double-count the same sustain. The segment's start is additionally pulled up to
 * `EARLY_WHAMMY_SECONDS` earlier (early whammy), clamped to never precede the previous note's
 * own tick (a hard safety floor - real play can't whammy a note before reaching it).
 */
function computeWhammySegments(track: DifficultyTrack, timing: TimingMap): WhammySegment[] {
  const sortedPhrases = [...track.starPower].sort((a, b) => a.tick - b.tick);
  const notes = track.notes;
  const segments: WhammySegment[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.length <= 0) continue;
    const phrase = sortedPhrases.find((p) => note.tick >= p.tick && note.tick < p.tick + p.length);
    if (!phrase) continue;

    let start = timing.ticksBefore(note.tick, EARLY_WHAMMY_SECONDS);
    const prevNote = notes[i - 1];
    if (prevNote) start = Math.max(start, prevNote.tick);
    start = Math.min(start, note.tick);

    segments.push({ start, end: note.tick + note.length });
  }
  segments.sort((a, b) => a.start - b.start);
  return segments;
}

/**
 * Tracks the cumulative (uncapped, unspent) SP gauge as a continuous function of tick,
 * built from instantaneous phrase-completion pulses and continuous whammy ramps.
 * Lets the optimizer query "how much gauge would be banked by tick t" at ANY tick,
 * not just at phrase boundaries.
 */
class GaugeTimeline {
  private eventTicks: number[] = [];
  private eventCumulative: number[] = [];
  private eventRateAfter: number[] = [];

  constructor(whammySegments: WhammySegment[], phrases: StarPowerPhrase[], resolution: number) {
    const rateUnitsPerTick = GAUGE_UNITS_PER_QUARTER_WHAMMY / resolution;
    const byTick = new Map<number, { rateDelta: number; pulse: number }>();
    const bump = (tick: number, rateDelta: number, pulse: number) => {
      const e = byTick.get(tick) ?? { rateDelta: 0, pulse: 0 };
      e.rateDelta += rateDelta;
      e.pulse += pulse;
      byTick.set(tick, e);
    };
    for (const seg of whammySegments) {
      bump(seg.start, rateUnitsPerTick, 0);
      bump(seg.end, -rateUnitsPerTick, 0);
    }
    for (const phrase of phrases) {
      bump(phrase.tick + phrase.length, 0, GAUGE_UNITS_PER_PHRASE);
    }

    const ticks = Array.from(byTick.keys()).sort((a, b) => a - b);
    let cumulative = 0;
    let rate = 0;
    let lastTick = ticks[0] ?? 0;
    for (const tick of ticks) {
      cumulative += rate * (tick - lastTick);
      const ev = byTick.get(tick)!;
      cumulative += ev.pulse;
      rate += ev.rateDelta;
      this.eventTicks.push(tick);
      this.eventCumulative.push(cumulative);
      this.eventRateAfter.push(rate);
      lastTick = tick;
    }
  }

  /** Raw cumulative gauge units banked by `tick`, ignoring any spending (uncapped). */
  gaugeAt(tick: number): number {
    if (this.eventTicks.length === 0) return 0;
    let lo = 0;
    let hi = this.eventTicks.length - 1;
    let idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.eventTicks[mid] <= tick) {
        idx = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (idx === -1) return 0;
    return this.eventCumulative[idx] + this.eventRateAfter[idx] * (tick - this.eventTicks[idx]);
  }
}

interface DecisionPoint {
  tick: number;
  gaugeDelta: number; // raw gauge units gained since the previous decision point
}

function buildDecisionPointsFromTimeline(
  track: DifficultyTrack,
  timeline: GaugeTimeline,
  whammySegments: WhammySegment[],
): DecisionPoint[] {
  // Decision points include every note boundary (so activation can align with any note,
  // not just SP phrase completions) plus every gauge-changing event.
  const tickSet = new Set<number>();
  for (const n of track.notes) {
    tickSet.add(n.tick);
    if (n.length > 0) tickSet.add(n.tick + n.length);
  }
  for (const seg of whammySegments) {
    tickSet.add(seg.start);
    tickSet.add(seg.end);
  }
  for (const p of track.starPower) {
    tickSet.add(p.tick);
    tickSet.add(p.tick + p.length);
  }

  const ticks = Array.from(tickSet).sort((a, b) => a - b);
  const points: DecisionPoint[] = [];
  let prevGauge = 0;
  for (const tick of ticks) {
    const gauge = timeline.gaugeAt(tick);
    points.push({ tick, gaugeDelta: gauge - prevGauge });
    prevGauge = gauge;
  }
  return points;
}

export interface Activation {
  startTick: number;
  endTick: number;
  gaugeUnitsUsed: number;
  measures: number;
  bonusPoints: number;
}

export interface OptimizationResult {
  activations: Activation[];
  starPowerBonus: number;
  totalScore: number;
  /** Indices into track.starPower of phrases whose gauge contribution was actually spent. */
  usedPhraseIndices: Set<number>;
}

interface DpState {
  bonus: number;
  /** Set only when this state was reached by activating; carries the full activation record. */
  activation: Activation | null;
  /** Direct link to the predecessor state - lets backtracking walk the chosen path without
   *  needing to know which point index a state "lives at" (important once jumps are involved). */
  prev: DpState | null;
}

function roundGauge(g: number): number {
  return Math.round(g * GAUGE_ROUNDING) / GAUGE_ROUNDING;
}

function mergeBest(map: Map<number, DpState>, gauge: number, state: DpState): void {
  const existing = map.get(gauge);
  if (!existing || existing.bonus < state.bonus) {
    map.set(gauge, state);
  }
}

/**
 * There is only ONE gauge, whether active or not. While active it continuously DRAINS (a full
 * bar empties over exactly 8 measures); whammying an SP-sustain note and completing further SP
 * phrases both still add to that SAME gauge at their normal rates, on top of the drain - net
 * positive for whammy, so a long enough chain of whammy/phrase completions can hold the gauge
 * steady or even refill it while still active (the real "chain whammy to extend/never-end Star
 * Power" technique). This simulates that piecewise until the gauge first reaches zero during a
 * stretch with no whammy or pulse to offset the drain (confirmed against CHOpt's sp.cpp:
 * SpData::activation_end_point - phrase pulses are modelled the same way as whammy, since both
 * ultimately just add to the one shared meter).
 */
function computeActivationWindow(
  startTick: number,
  gaugeUnits: number,
  whammySegments: WhammySegment[],
  phrases: StarPowerPhrase[],
  timing: TimingMap,
  resolution: number,
): { endTick: number; measures: number } {
  let remaining = gaugeUnits;
  let currentTick = startTick;

  const segQueue = whammySegments.filter((seg) => seg.end > startTick).sort((a, b) => a.start - b.start);
  const pulseQueue = phrases
    .map((p) => p.tick + p.length)
    .filter((t) => t > startTick)
    .sort((a, b) => a - b);
  let segIdx = 0;
  let pulseIdx = 0;

  const drainToTick = (targetTick: number): boolean => {
    // Drains the pure gap [currentTick, targetTick). If the gauge runs out before reaching
    // targetTick, sets currentTick to the exact zero-crossing point and remaining to 0, then
    // returns true (signalling the caller to stop).
    if (targetTick <= currentTick) return false;
    const gapMeasures = timing.ticksToMeasures(targetTick) - timing.ticksToMeasures(currentTick);
    const drain = gapMeasures * DRAIN_UNITS_PER_MEASURE_WHILE_ACTIVE;
    if (drain >= remaining) {
      const measuresToZero = remaining / DRAIN_UNITS_PER_MEASURE_WHILE_ACTIVE;
      currentTick = timing.addMeasures(currentTick, measuresToZero);
      remaining = 0;
      return true;
    }
    remaining -= drain;
    currentTick = targetTick;
    return false;
  };

  while (segIdx < segQueue.length || pulseIdx < pulseQueue.length) {
    const nextSeg = segQueue[segIdx];
    const nextSegStart = nextSeg ? Math.max(nextSeg.start, currentTick) : Infinity;
    const nextPulseTick = pulseIdx < pulseQueue.length ? pulseQueue[pulseIdx] : Infinity;

    if (nextPulseTick <= nextSegStart) {
      if (drainToTick(nextPulseTick)) break;
      remaining = Math.min(remaining + GAUGE_UNITS_PER_PHRASE, GAUGE_UNITS_FULL);
      pulseIdx++;
      continue;
    }

    if (drainToTick(nextSegStart)) break;

    // Whammy segment: gain is inherently per-BEAT (quarter note), independent of time
    // signature, so compute it from raw ticks/resolution - only the concurrent drain
    // (measure-based) needs the time-signature-aware conversion. The net rate during whammy is
    // always >= 0 (16 units/measure gain vs 15 units/measure drain), so the gauge can never hit
    // zero mid-segment - any pulses falling inside it can safely be folded in without needing
    // exact ordering (nothing here can cross zero either way).
    const segEnd = nextSeg.end;
    while (pulseIdx < pulseQueue.length && pulseQueue[pulseIdx] < segEnd) {
      remaining = Math.min(remaining + GAUGE_UNITS_PER_PHRASE, GAUGE_UNITS_FULL);
      pulseIdx++;
    }
    const segTicks = segEnd - currentTick;
    const gain = (segTicks / resolution) * GAUGE_UNITS_PER_QUARTER_WHAMMY;
    const segMeasures = timing.ticksToMeasures(segEnd) - timing.ticksToMeasures(currentTick);
    const drain = segMeasures * DRAIN_UNITS_PER_MEASURE_WHILE_ACTIVE;
    remaining = Math.min(remaining + gain - drain, GAUGE_UNITS_FULL);
    currentTick = segEnd;
    segIdx++;
  }

  const measuresToZero = remaining / DRAIN_UNITS_PER_MEASURE_WHILE_ACTIVE;
  const endTick = timing.addMeasures(currentTick, measuresToZero);
  return { endTick, measures: timing.ticksToMeasures(endTick) - timing.ticksToMeasures(startTick) };
}

/**
 * Finds the first index > afterIndex whose tick is >= targetTick (binary search).
 * Returns points.length if no such point exists (the activation runs past the last
 * decision point, i.e. to/past the end of the considered range).
 */
function findLandingIndex(points: DecisionPoint[], afterIndex: number, targetTick: number): number {
  let lo = afterIndex + 1;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].tick >= targetTick) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export function optimizeStarPower(
  track: DifficultyTrack,
  scored: ScoredTrack,
  timing: TimingMap,
  resolution: number,
): OptimizationResult {
  const whammySegments = computeWhammySegments(track, timing);
  const timeline = new GaugeTimeline(whammySegments, track.starPower, resolution);
  const points = buildDecisionPointsFromTimeline(track, timeline, whammySegments);
  const scoreIndex = new ScoreRangeIndex(scored);

  if (points.length === 0 || track.starPower.length === 0) {
    return {
      activations: [],
      starPowerBonus: 0,
      totalScore: scored.baseScoreNoStarPower + scored.soloBonus + scored.cleanPlayBonus,
      usedPhraseIndices: new Set(),
    };
  }

  const initialState: DpState = { bonus: 0, activation: null, prev: null };
  let current = new Map<number, DpState>([[0, initialState]]);

  // Arrivals from an activation that "jumps over" one or more decision points while its
  // window is still active - keyed by the landing index they should be merged in at.
  const pendingArrivals = new Map<number, Map<number, DpState>>();
  // Activations whose window extends past the very last decision point.
  const finalCandidates: DpState[] = [];

  for (let i = 0; i < points.length; i++) {
    const arrivals = pendingArrivals.get(i);
    if (arrivals) {
      for (const [gauge, state] of arrivals) mergeBest(current, gauge, state);
      pendingArrivals.delete(i);
    }

    const point = points[i];
    const next = new Map<number, DpState>();

    for (const [gauge, state] of current) {
      const filled = roundGauge(Math.min(GAUGE_UNITS_FULL, gauge + point.gaugeDelta));

      // Option A: keep banking, don't activate here.
      mergeBest(next, filled, { bonus: state.bonus, activation: null, prev: state });

      // Option B: activate right now using everything banked so far (if eligible). While
      // this activation's window is running, you cannot activate again - so any decision
      // points that fall inside it are skipped over (their gauge still accrues in the
      // background) and the resulting state "lands" at the first point at/after the window
      // ends.
      if (filled >= GAUGE_UNITS_MIN_ACTIVATE) {
        const { endTick, measures } = computeActivationWindow(
          point.tick,
          filled,
          whammySegments,
          track.starPower,
          timing,
          resolution,
        );
        const bonusGain = scoreIndex.scoreInRange(point.tick, endTick);
        const activatedState: DpState = {
          bonus: state.bonus + bonusGain,
          activation: { startTick: point.tick, endTick, gaugeUnitsUsed: filled, measures, bonusPoints: bonusGain },
          prev: state,
        };

        const landingIndex = findLandingIndex(points, i, endTick);
        if (landingIndex >= points.length) {
          finalCandidates.push(activatedState);
        } else {
          // The gauge is, by construction, exactly 0 at the moment the window ends (that's
          // what "ends" means for the single shared meter) - any whammy/phrase gain during the
          // window already went into extending this activation above, so none of it carries
          // over to bank for the next one.
          let bucket = pendingArrivals.get(landingIndex);
          if (!bucket) {
            bucket = new Map<number, DpState>();
            pendingArrivals.set(landingIndex, bucket);
          }
          mergeBest(bucket, 0, activatedState);
        }
      }
    }

    current = next;
  }

  // Any arrivals that landed exactly at (or past) the end of the point list.
  const tailArrivals = pendingArrivals.get(points.length);
  if (tailArrivals) for (const state of tailArrivals.values()) finalCandidates.push(state);

  let best: DpState = initialState;
  for (const state of current.values()) if (state.bonus > best.bonus) best = state;
  for (const state of finalCandidates) if (state.bonus > best.bonus) best = state;

  const activations: Activation[] = [];
  for (let s: DpState | null = best; s; s = s.prev) {
    if (s.activation) activations.push(s.activation);
  }
  activations.reverse();

  // For display: a phrase counts as "used" if its completion tick was banked into
  // whichever activation came next after it (or is still banked if it's the very
  // last, unspent contribution).
  const usedPhraseIndices = new Set<number>();
  for (let i = 0; i < track.starPower.length; i++) {
    const phraseEndTick = track.starPower[i].tick + track.starPower[i].length;
    const nextActivation = activations.find((a) => a.startTick >= phraseEndTick);
    if (nextActivation) usedPhraseIndices.add(i);
  }

  return {
    activations,
    starPowerBonus: best.bonus,
    totalScore: scored.baseScoreNoStarPower + scored.soloBonus + scored.cleanPlayBonus + best.bonus,
    usedPhraseIndices,
  };
}
