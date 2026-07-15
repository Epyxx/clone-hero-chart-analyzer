import type { ParsedChart } from './chart';
import type { TimingMap } from './timing';

export interface ChartStats {
  bpmMin: number;
  bpmMax: number;
  lengthSeconds: number;
  timeSignatures: string[];
}

export function computeChartStats(chart: ParsedChart, timing: TimingMap): ChartStats {
  const bpms = chart.tempos.map((t) => 60_000_000 / t.usPerQuarter);
  const timeSignatures = Array.from(new Set(chart.timeSigs.map((ts) => `${ts.numerator}/${ts.denominator}`)));

  return {
    bpmMin: Math.min(...bpms),
    bpmMax: Math.max(...bpms),
    lengthSeconds: timing.ticksToSeconds(chart.lastTick),
    timeSignatures,
  };
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
