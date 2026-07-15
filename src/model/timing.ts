import type { ParsedChart, TempoEvent, TimeSigEvent } from './chart';

interface TempoSegment {
  startTick: number;
  startSeconds: number;
  usPerQuarter: number;
}

interface MeasureSegment {
  startTick: number;
  startMeasure: number;
  ticksPerMeasure: number;
}

export class TimingMap {
  private tempoSegments: TempoSegment[];
  private measureSegments: MeasureSegment[];
  readonly resolution: number;

  constructor(chart: ParsedChart) {
    this.resolution = chart.resolution;
    this.tempoSegments = buildTempoSegments(chart.tempos, chart.resolution);
    this.measureSegments = buildMeasureSegments(chart.timeSigs, chart.resolution);
  }

  ticksToSeconds(tick: number): number {
    const seg = findSegment(this.tempoSegments, (s) => s.startTick, tick);
    const quarterNotes = (tick - seg.startTick) / this.resolution;
    return seg.startSeconds + quarterNotes * (seg.usPerQuarter / 1_000_000);
  }

  ticksToMeasures(tick: number): number {
    const seg = findSegment(this.measureSegments, (s) => s.startTick, tick);
    return seg.startMeasure + (tick - seg.startTick) / seg.ticksPerMeasure;
  }

  /** Given a start tick and a number of measures forward, returns the resulting tick. */
  addMeasures(startTick: number, measures: number): number {
    const startMeasure = this.ticksToMeasures(startTick);
    const targetMeasure = startMeasure + measures;
    const seg = findSegmentByValue(this.measureSegments, (s) => s.startMeasure, targetMeasure);
    return seg.startTick + (targetMeasure - seg.startMeasure) * seg.ticksPerMeasure;
  }

  /** Returns the tick that is `seconds` earlier than `tick`, using the tempo active at `tick`. */
  ticksBefore(tick: number, seconds: number): number {
    const seg = findSegment(this.tempoSegments, (s) => s.startTick, tick);
    const ticksPerSecond = (1_000_000 / seg.usPerQuarter) * this.resolution;
    return tick - seconds * ticksPerSecond;
  }
}

function buildTempoSegments(tempos: TempoEvent[], _resolution: number): TempoSegment[] {
  const sorted = [...tempos].sort((a, b) => a.tick - b.tick);
  const segments: TempoSegment[] = [];
  let seconds = 0;
  let prevTick = 0;
  let prevUs = sorted[0]?.usPerQuarter ?? 500000;
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (i > 0) {
      const deltaQuarters = (t.tick - prevTick) / (_resolution || 1);
      seconds += deltaQuarters * (prevUs / 1_000_000);
    }
    segments.push({ startTick: t.tick, startSeconds: seconds, usPerQuarter: t.usPerQuarter });
    prevTick = t.tick;
    prevUs = t.usPerQuarter;
  }
  return segments;
}

function buildMeasureSegments(timeSigs: TimeSigEvent[], resolution: number): MeasureSegment[] {
  const sorted = [...timeSigs].sort((a, b) => a.tick - b.tick);
  const segments: MeasureSegment[] = [];
  let measure = 0;
  let prevTick = 0;
  let prevTicksPerMeasure = ticksPerMeasure(sorted[0] ?? { tick: 0, numerator: 4, denominator: 4 }, resolution);
  for (let i = 0; i < sorted.length; i++) {
    const ts = sorted[i];
    if (i > 0) {
      measure += (ts.tick - prevTick) / prevTicksPerMeasure;
    }
    const tpm = ticksPerMeasure(ts, resolution);
    segments.push({ startTick: ts.tick, startMeasure: measure, ticksPerMeasure: tpm });
    prevTick = ts.tick;
    prevTicksPerMeasure = tpm;
  }
  return segments;
}

function ticksPerMeasure(ts: TimeSigEvent, resolution: number): number {
  return resolution * ts.numerator * (4 / ts.denominator);
}

function findSegment<T>(segments: T[], key: (s: T) => number, tick: number): T {
  let lo = 0;
  let hi = segments.length - 1;
  let result = segments[0];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(segments[mid]) <= tick) {
      result = segments[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

function findSegmentByValue<T>(segments: T[], key: (s: T) => number, value: number): T {
  let lo = 0;
  let hi = segments.length - 1;
  let result = segments[0];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(segments[mid]) <= value) {
      result = segments[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
