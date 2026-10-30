import type { DifficultyTrack } from '../model/chart';
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
// Clone Hero's standard (non-"Precision Mode") guitar hit window, confirmed by decompiling the
// game's own Assembly-CSharp.dll (BasePlayer's front-timing field defaults to 0.07f; Precision
// Mode tightens it to 0.0525f but is an opt-in harder modifier no score-maximizing player would
// enable). Any note can legally be hit up to this long before its own tick. Two consequences are
// modelled here: (1) "early whammy" - a SP-sustain note whammied from that earlier point gains a
// small head start; (2) "phrase squeeze" - the +GAUGE_UNITS_PER_PHRASE gauge pulse for completing
// an SP phrase fires the instant the phrase's last note is hit-processed (BasePlayer.cs: awarded
// synchronously inside the note-hit handler, not at any fixed chart tick), so hitting that note
// early banks the pulse earlier too, letting an activation's fixed-duration window start (and
// therefore end) sooner and cover more of the song - the real, measured source of the small
// margin by which top squeeze-heavy runs can exceed a naive tick-exact optimum (see
// AssumptionsPanel).
const EARLY_WHAMMY_SECONDS = 0.07;
// The same hit window also lets Star Power "squeeze" extra notes into an activation: a note counts
// toward SP if it is HIT while SP is active, so a note up to this long before the activation can
// be hit late (after SP has started) and a note up to this long after SP ends can be hit early
// (before it stops). The game even tracks these (its score breakdown has a "squeezes" count and
// "Squeeze Score"). Confirmed against a real #1 leaderboard score (Falling In Reverse - Losing
// My Life) that exceeded the tick-exact optimum by exactly the notes squeezed in at both ends of
// its activations. The epsilon makes the edge inclusive: charts commonly land a note exactly one
// hit window past an activation's end, and a real player hitting at 69.9ms catches it.
const SQUEEZE_WINDOW_SECONDS = 0.07;
const SQUEEZE_EPSILON_SECONDS = 1e-4;

export interface WhammySegment {
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
 *
 * A long sustain (e.g. a held chord) commonly runs underneath several shorter single notes -
 * each of those notes contributes its own [start, end] span here, which can overlap the still-
 * active long note's span. A player only has one whammy bar, so overlapping spans must count as
 * ONE continuous whammy-able window, not stack additively - the raw per-note spans are merged
 * into their union before returning so GaugeTimeline never sums two overlapping rates into an
 * impossible >1x gain (confirmed as a real bug: it let the gauge reach 50% far earlier than any
 * amount of real or by-hand whammying could actually achieve).
 */
export function computeWhammySegments(
  track: DifficultyTrack,
  timing: TimingMap,
  sustainCutoffTicks = 0,
  earlyWhammySeconds = EARLY_WHAMMY_SECONDS,
): WhammySegment[] {
  const sortedPhrases = [...track.starPower].sort((a, b) => a.tick - b.tick);
  const notes = track.notes;
  const rawSegments: WhammySegment[] = [];
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (note.length <= sustainCutoffTicks) continue;
    const phrase = sortedPhrases.find((p) => note.tick >= p.tick && note.tick < p.tick + p.length);
    if (!phrase) continue;

    let start = timing.ticksBefore(note.tick, earlyWhammySeconds);
    const prevNote = notes[i - 1];
    if (prevNote) start = Math.max(start, prevNote.tick);
    start = Math.min(start, note.tick);

    rawSegments.push({ start, end: note.tick + note.length });
  }
  rawSegments.sort((a, b) => a.start - b.start);

  const segments: WhammySegment[] = [];
  for (const seg of rawSegments) {
    const last = segments[segments.length - 1];
    if (last && seg.start <= last.end) {
      last.end = Math.max(last.end, seg.end);
    } else {
      segments.push({ ...seg });
    }
  }
  return segments;
}

/**
 * The tick at which each SP phrase's completion pulse (+GAUGE_UNITS_PER_PHRASE) actually fires:
 * the moment its last contained note is hit, which - like any note - can legally happen up to
 * EARLY_WHAMMY_SECONDS before that note's own chart tick (see the constant's doc comment). A
 * phrase with no notes in its range (a malformed/empty phrase) can never be completed by a real
 * hit, so it falls back to its nominal end tick rather than contributing a squeeze-shifted pulse.
 */
function computePhrasePulseTicks(
  track: DifficultyTrack,
  timing: TimingMap,
  earlyHitSeconds = EARLY_WHAMMY_SECONDS,
  noteGapSeconds = 0,
  settleSeconds = 0,
): number[] {
  const sortedPhrases = [...track.starPower].sort((a, b) => a.tick - b.tick);
  const notes = track.notes;
  return sortedPhrases.map((phrase) => {
    let lastIndex = -1;
    for (let i = 0; i < notes.length; i++) {
      const tick = notes[i].tick;
      if (tick >= phrase.tick && tick < phrase.tick + phrase.length) lastIndex = i;
      else if (tick >= phrase.tick + phrase.length) break;
    }
    if (lastIndex === -1) return phrase.tick + phrase.length;

    const note = notes[lastIndex];
    let pulseTick = timing.ticksBefore(note.tick, earlyHitSeconds);
    const prevNote = notes[lastIndex - 1];
    // The previous note must still be struck first - with a minimum gap between strums if the
    // caller needs one (a bot can't strum two notes arbitrarily close together).
    if (prevNote) pulseTick = Math.max(pulseTick, timing.ticksBefore(prevNote.tick, -noteGapSeconds));
    pulseTick = Math.min(pulseTick, note.tick);
    // A caller that presses the SP button right at the pulse needs the game to have processed the
    // note hit first.
    return settleSeconds > 0 ? timing.ticksBefore(pulseTick, -settleSeconds) : pulseTick;
  });
}

/** Index into `track.notes` of each sorted SP phrase's last contained note (-1 if it has none). */
function phraseLastNoteIndices(track: DifficultyTrack): number[] {
  const notes = track.notes;
  return [...track.starPower]
    .sort((a, b) => a.tick - b.tick)
    .map((phrase) => {
      let lastIndex = -1;
      for (let i = 0; i < notes.length; i++) {
        const tick = notes[i].tick;
        if (tick >= phrase.tick && tick < phrase.tick + phrase.length) lastIndex = i;
        else if (tick >= phrase.tick + phrase.length) break;
      }
      return lastIndex;
    });
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

  constructor(whammySegments: WhammySegment[], phrasePulseTicks: number[], resolution: number) {
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
    for (const tick of phrasePulseTicks) {
      bump(tick, 0, GAUGE_UNITS_PER_PHRASE);
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
  timing: TimingMap,
  track: DifficultyTrack,
  timeline: GaugeTimeline,
  whammySegments: WhammySegment[],
  phrasePulseTicks: number[],
  resolution: number,
  squeezeWindowSeconds: number,
): DecisionPoint[] {
  // Decision points include every note boundary (so activation can align with any note,
  // not just SP phrase completions) plus every gauge-changing event.
  const tickSet = new Set<number>();
  for (const n of track.notes) {
    tickSet.add(n.tick);
    if (n.length > 0) tickSet.add(n.tick + n.length);
  }
  // Real activation input is polled every frame with no hit-window/note-grid constraint at all
  // (confirmed in the decompiled input handler - the SP button is checked in Update(), completely
  // decoupled from note timing), so a real player can activate the instant the gauge crosses the
  // 50%-full threshold mid-whammy, not just at a note/segment boundary. Subdividing each whammy
  // segment gives the DP those intermediate activation candidates too.
  const SUBDIVISION_TICKS = Math.max(1, Math.round(resolution / 8));
  for (const seg of whammySegments) {
    tickSet.add(seg.start);
    tickSet.add(seg.end);
    for (let tick = seg.start + SUBDIVISION_TICKS; tick < seg.end; tick += SUBDIVISION_TICKS) {
      tickSet.add(tick);
    }
  }
  for (const tick of phrasePulseTicks) {
    tickSet.add(tick);
  }
  // The best activation start for squeezing is generally NOT on a note's own tick but up to a
  // hit window either side of it (activate just before a note and hit it early, or just after it
  // and hit it late), so offer those as candidates too.
  for (const n of track.notes) {
    for (const offset of [-1, -0.5, 0.5, 1].map((f) => f * squeezeWindowSeconds)) tickSet.add(Math.round(timing.ticksBefore(n.tick, -offset) * 100) / 100);
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
  /** The exact (un-rounded) gauge this state carries. The DP's map key is only a rounded bucket
   *  of it - accumulating the rounded value instead would add a bias on every step (e.g. a
   *  +0.125 whammy sliver always rounds UP to 0.25, doubling the gain across a finely-subdivided
   *  segment), which the DP then exploits by picking whichever path rounds most favourably. */
  gauge: number;
  /** End tick of the most recent activation on this path (-Infinity if none yet) - notes squeezed
   *  into that activation's tail must not also be squeezed into the next one's head. */
  lastEndTick: number;
  /** Set only when this state was reached by activating; carries the full activation record. */
  activation: Activation | null;
  /** Direct link to the predecessor state - lets backtracking walk the chosen path without
   *  needing to know which point index a state "lives at" (important once jumps are involved). */
  prev: DpState | null;
}

function roundGauge(g: number): number {
  return Math.round(g * GAUGE_ROUNDING) / GAUGE_ROUNDING;
}

function mergeBest(map: Map<number, DpState>, bucket: number, state: DpState): void {
  const existing = map.get(bucket);
  if (!existing || existing.bonus < state.bonus) {
    map.set(bucket, state);
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
  phrasePulseTicks: number[],
  timing: TimingMap,
  resolution: number,
): { endTick: number; measures: number } {
  let remaining = gaugeUnits;
  let currentTick = startTick;

  const segQueue = whammySegments.filter((seg) => seg.end > startTick).sort((a, b) => a.start - b.start);
  const pulseQueue = phrasePulseTicks.filter((t) => t > startTick).sort((a, b) => a - b);
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

export interface OptimizeOptions {
  /** Hit-window slack, in seconds, assumed usable at each end of an activation (default: the
   *  game's full 0.07s). A caller that must actually execute the plan (e.g. a bot) can pass a
   *  smaller, safer window. 0 disables squeezing. */
  squeezeWindowSeconds?: number;
  /** Override of `squeezeWindowSeconds` for the START of an activation only (notes struck late,
   *  after the SP press) / the END only (notes struck early, before SP runs out). */
  squeezeStartWindowSeconds?: number;
  squeezeEndWindowSeconds?: number;
  /** How far before its tick a phrase's last note may be struck to bank the phrase pulse early
   *  (default 0.07s, the full hit window). */
  earlyHitSeconds?: number;
  /** How far before its tick a sustain may start being whammied (default 0.07s). */
  earlyWhammySeconds?: number;
  /** Minimum gap between two strums, when the early-hit pulse has to wait for the previous note. */
  noteGapSeconds?: number;
  /** Delay between a phrase pulse being banked and the SP button being usable. */
  pulseSettleSeconds?: number;
}

export function optimizeStarPower(
  track: DifficultyTrack,
  scored: ScoredTrack,
  timing: TimingMap,
  resolution: number,
  sustainCutoffTicks = 0,
  options: OptimizeOptions = {},
): OptimizationResult {
  const squeezeWindow = options.squeezeWindowSeconds ?? SQUEEZE_WINDOW_SECONDS;
  const squeezeStartWindow = options.squeezeStartWindowSeconds ?? squeezeWindow;
  const squeezeEndWindow = options.squeezeEndWindowSeconds ?? squeezeWindow;
  const whammySegments = computeWhammySegments(track, timing, sustainCutoffTicks, options.earlyWhammySeconds);
  const phrasePulseTicks = computePhrasePulseTicks(track, timing, options.earlyHitSeconds, options.noteGapSeconds, options.pulseSettleSeconds);
  const timeline = new GaugeTimeline(whammySegments, phrasePulseTicks, resolution);
  const points = buildDecisionPointsFromTimeline(timing, track, timeline, whammySegments, phrasePulseTicks, resolution, Math.max(squeezeStartWindow, squeezeEndWindow));
  const scoreIndex = new ScoreRangeIndex(scored);
  const phraseLastNote = phraseLastNoteIndices(track);

  if (points.length === 0 || track.starPower.length === 0) {
    return {
      activations: [],
      starPowerBonus: 0,
      totalScore: scored.baseScoreNoStarPower + scored.soloBonus + scored.cleanPlayBonus,
      usedPhraseIndices: new Set(),
    };
  }

  const initialState: DpState = { bonus: 0, gauge: 0, lastEndTick: -Infinity, activation: null, prev: null };
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

    for (const state of current.values()) {
      const filled = Math.min(GAUGE_UNITS_FULL, state.gauge + point.gaugeDelta);

      // Option A: keep banking, don't activate here.
      mergeBest(next, roundGauge(filled), { bonus: state.bonus, gauge: filled, lastEndTick: state.lastEndTick, activation: null, prev: state });

      // Option B: activate right now using everything banked so far (if eligible). While
      // this activation's window is running, you cannot activate again - so any decision
      // points that fall inside it are skipped over (their gauge still accrues in the
      // background) and the resulting state "lands" at the first point at/after the window
      // ends.
      if (filled >= GAUGE_UNITS_MIN_ACTIVATE - 1e-6) {
        const { endTick, measures } = computeActivationWindow(
          point.tick,
          filled,
          whammySegments,
          phrasePulseTicks,
          timing,
          resolution,
        );
        const slackFrom = timing.ticksBefore(point.tick, squeezeStartWindow + SQUEEZE_EPSILON_SECONDS);
        const slackTo = timing.ticksBefore(endTick, -(squeezeEndWindow + SQUEEZE_EPSILON_SECONDS));
        // The previous activation already claimed every note up to its own end + one hit window.
        const hitFrom = Math.max(slackFrom, state.lastEndTick === -Infinity ? -Infinity : timing.ticksBefore(state.lastEndTick, -(squeezeEndWindow + SQUEEZE_EPSILON_SECONDS)));
        let bonusGain = scoreIndex.scoreWithHitSlack(point.tick, endTick, hitFrom, slackTo);

        // If the phrase-completing note is what lifted the gauge to the 50% needed to activate,
        // that very note was struck BEFORE the activation, so it can't itself score Star Power -
        // even though its tick lies inside (or within a hit window of) the activation. (If the
        // gauge was already high enough without it, the player is free to strike it later.)
        if (filled - GAUGE_UNITS_PER_PHRASE < GAUGE_UNITS_MIN_ACTIVATE - 1e-6) {
          let critical = -1;
          for (let j = 0; j < phrasePulseTicks.length; j++) {
            if (phrasePulseTicks[j] <= point.tick + 1e-6 && phrasePulseTicks[j] > state.lastEndTick && (critical < 0 || phrasePulseTicks[j] > phrasePulseTicks[critical])) critical = j;
          }
          const noteIdx = critical >= 0 ? phraseLastNote[critical] : -1;
          if (noteIdx >= 0) {
            const info = scored.notes[noteIdx];
            if (info && info.note.tick >= hitFrom && info.note.tick < slackTo) bonusGain -= info.hitPoints;
          }
        }
        const activatedState: DpState = {
          bonus: state.bonus + bonusGain,
          gauge: 0,
          lastEndTick: endTick,
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
