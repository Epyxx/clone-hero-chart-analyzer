import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { DrumDifficultyTrack } from '../model/chart';
import type { TimingMap } from '../model/timing';
import type { Activation } from '../scoring/optimizer';
import { ScoreRangeIndex, DRUM_SOLO_BONUS_PER_NOTE } from '../scoring/score';
import { formatDuration } from '../model/stats';
import { useLanguage } from '../i18n/LanguageContext';

const KICK_COLOR = '#f2953d';
const PAD_COLORS: Record<1 | 2 | 3 | 4, string> = { 1: '#e8433f', 2: '#f2d43d', 3: '#3d8ef2', 4: '#3ddc3d' };
const LANE_HEIGHT = 26;
const LANE_GAP = 4;
const TOP_MARGIN = 34;
const BOTTOM_MARGIN = 22;
/** Only the 4 real pad lanes (red/yellow/blue/green) get their own row - kick spans full-width. */
const LANE_COUNT = 4;

interface Props {
  track: DrumDifficultyTrack;
  timing: TimingMap;
  lastTick: number;
  activations: Activation[];
  usedPhraseIndices: Set<number>;
  scoreIndex: ScoreRangeIndex;
  pxPerTick: number;
}

function starPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const spikes = 5;
  const step = Math.PI / spikes;
  let rot = -Math.PI / 2;
  const pts: string[] = [];
  for (let i = 0; i < spikes; i++) {
    pts.push(`${cx + Math.cos(rot) * outerR},${cy + Math.sin(rot) * outerR}`);
    rot += step;
    pts.push(`${cx + Math.cos(rot) * innerR},${cy + Math.sin(rot) * innerR}`);
    rot += step;
  }
  return pts.join(' ');
}

function diamondPoints(cx: number, cy: number, r: number): string {
  return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
}

function upperBound(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function DrumHighway({ track, timing, lastTick, activations, usedPhraseIndices, scoreIndex, pxPerTick }: Props) {
  const { t, locale } = useLanguage();
  const width = Math.max(800, lastTick * pxPerTick + 200);
  const height = TOP_MARGIN + LANE_COUNT * (LANE_HEIGHT + LANE_GAP) + BOTTOM_MARGIN;
  // Pad lanes 1-4 (red/yellow/blue/green) map to rows 0-3; kick (lane 0) has no row of its own.
  const laneY = (lane: 1 | 2 | 3 | 4) => TOP_MARGIN + (lane - 1) * (LANE_HEIGHT + LANE_GAP);
  const kickY = TOP_MARGIN;
  const kickHeight = LANE_COUNT * (LANE_HEIGHT + LANE_GAP) - LANE_GAP;

  const [hoverTick, setHoverTick] = useState<number | null>(null);

  const measureLines = useMemo(() => {
    const lines: { tick: number; index: number }[] = [];
    let m = 0;
    let tick = 0;
    let guard = 0;
    while (tick <= lastTick && guard < 20000) {
      lines.push({ tick, index: m });
      m += 1;
      tick = timing.addMeasures(0, m);
      guard += 1;
    }
    return lines;
  }, [timing, lastTick]);

  const soloNoteTicks = useMemo(() => {
    if (track.solos.length === 0) return [];
    const ticks: number[] = [];
    for (const solo of track.solos) {
      const soloEnd = solo.tick + solo.length;
      for (const note of track.notes) {
        if (note.tick >= solo.tick && note.tick < soloEnd) ticks.push(note.tick);
      }
    }
    return ticks.sort((a, b) => a - b);
  }, [track]);

  function isInStarPower(tick: number): boolean {
    return track.starPower.some((sp) => tick >= sp.tick && tick < sp.tick + sp.length);
  }

  function cumulativeScoreAt(tick: number): number {
    const base = scoreIndex.scoreInRange(-Infinity, tick);
    let spBonus = 0;
    for (const a of activations) {
      if (tick <= a.startTick) continue;
      spBonus += tick >= a.endTick ? a.bonusPoints : scoreIndex.scoreInRange(a.startTick, tick);
    }
    const soloBonus = upperBound(soloNoteTicks, tick) * DRUM_SOLO_BONUS_PER_NOTE;
    return base + spBonus + soloBonus;
  }

  function handleMouseMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoverTick(Math.max(0, x / pxPerTick));
  }

  const hover = useMemo(() => {
    if (hoverTick === null) return null;
    return {
      x: hoverTick * pxPerTick,
      score: cumulativeScoreAt(hoverTick),
      seconds: timing.ticksToSeconds(hoverTick),
      measure: timing.ticksToMeasures(hoverTick),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverTick, pxPerTick, timing, scoreIndex, activations, soloNoteTicks]);

  const tooltipWidth = 176;
  const tooltipHeight = 46;
  const tooltipX = hover ? Math.min(Math.max(hover.x + 10, 4), width - tooltipWidth - 4) : 0;

  return (
    <svg
      width={width}
      height={height}
      className="highway"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverTick(null)}
    >
      <rect x={0} y={0} width={width} height={height} fill="#0d0f14" />

      {measureLines.map((l) => (
        <g key={l.tick}>
          <line
            x1={l.tick * pxPerTick}
            y1={TOP_MARGIN}
            x2={l.tick * pxPerTick}
            y2={height - BOTTOM_MARGIN}
            stroke="#262b36"
            strokeWidth={l.index % 4 === 0 ? 1.4 : 0.6}
          />
          {l.index % 4 === 0 && (
            <text x={l.tick * pxPerTick + 3} y={height - 6} fill="#5b6472" fontSize={10}>
              {l.index}
            </text>
          )}
        </g>
      ))}

      {([1, 2, 3, 4] as const).map((lane) => (
        <line
          key={lane}
          x1={0}
          y1={laneY(lane) + LANE_HEIGHT / 2}
          x2={width}
          y2={laneY(lane) + LANE_HEIGHT / 2}
          stroke="#1a1e27"
          strokeWidth={LANE_HEIGHT}
        />
      ))}

      {track.starPower.map((sp, i) => (
        <rect
          key={i}
          x={sp.tick * pxPerTick}
          y={TOP_MARGIN}
          width={Math.max(1, sp.length * pxPerTick)}
          height={LANE_COUNT * (LANE_HEIGHT + LANE_GAP)}
          fill={usedPhraseIndices.has(i) ? 'rgba(140, 110, 255, 0.22)' : 'rgba(140, 110, 255, 0.10)'}
          stroke={usedPhraseIndices.has(i) ? '#a78bfa' : '#5b4d8f'}
          strokeWidth={1}
        />
      ))}

      {activations.map((a, i) => (
        <g key={i}>
          <rect
            x={a.startTick * pxPerTick}
            y={8}
            width={Math.max(1, (a.endTick - a.startTick) * pxPerTick)}
            height={height - 8}
            fill="rgba(255, 200, 60, 0.14)"
          />
          <rect
            x={a.startTick * pxPerTick}
            y={8}
            width={Math.max(1, (a.endTick - a.startTick) * pxPerTick)}
            height={10}
            fill="#ffc83c"
          />
          <text x={a.startTick * pxPerTick + 4} y={17} fontSize={9} fill="#3a2a00" fontWeight={700}>
            8x SP
          </text>
        </g>
      ))}

      {track.freestyle.map((f, i) => (
        <rect
          key={i}
          x={f.tick * pxPerTick}
          y={TOP_MARGIN}
          width={Math.max(1, f.length * pxPerTick)}
          height={LANE_COUNT * (LANE_HEIGHT + LANE_GAP)}
          fill="rgba(56, 224, 224, 0.08)"
          stroke="#38e0e0"
          strokeWidth={1}
          strokeDasharray="4,3"
        />
      ))}

      {track.solos.map((s, i) => (
        <rect
          key={i}
          x={s.tick * pxPerTick}
          y={TOP_MARGIN}
          width={Math.max(1, s.length * pxPerTick)}
          height={4}
          fill="#38e0e0"
        />
      ))}

      {track.notes.map((note, i) => {
        const x = note.tick * pxPerTick;
        const isStarPower = isInStarPower(note.tick);
        const opacity = note.isGhost ? 0.5 : 1;

        if (note.lane === 0) {
          // Kick spans the full width of the highway, like an Open note on guitar - it's not
          // tied to any single pad lane.
          const barOpacity = note.isDoubleKick ? 1 : opacity;
          return (
            <g key={i}>
              <rect x={x - 4} y={kickY} width={8} height={kickHeight} fill={KICK_COLOR} opacity={barOpacity} rx={2} />
              {note.isDoubleKick && (
                <rect x={x - 4} y={kickY} width={8} height={kickHeight} fill="none" stroke="#ffffff" strokeWidth={1.5} rx={2} />
              )}
              {isStarPower && (
                <polygon points={starPoints(x, kickY + kickHeight / 2, 8, 3.5)} fill="#ffe066" opacity={barOpacity} />
              )}
            </g>
          );
        }

        const lane = note.lane as 1 | 2 | 3 | 4;
        const cy = laneY(lane) + LANE_HEIGHT / 2;
        const radius = (note.isAccent ? LANE_HEIGHT / 2 - 1 : LANE_HEIGHT / 2 - 3) * (note.isGhost ? 0.75 : 1);
        const color = PAD_COLORS[lane];
        return (
          <g key={i}>
            {isStarPower ? (
              <polygon
                points={starPoints(x, cy, LANE_HEIGHT / 2 - 1, (LANE_HEIGHT / 2 - 1) * 0.42)}
                fill={color}
                opacity={opacity}
                stroke="#00000055"
                strokeWidth={1}
              />
            ) : note.isCymbal ? (
              <polygon points={diamondPoints(x, cy, radius)} fill={color} opacity={opacity} stroke="#00000055" strokeWidth={1} />
            ) : (
              <circle cx={x} cy={cy} r={radius} fill={color} opacity={opacity} stroke="#00000055" strokeWidth={1} />
            )}
            {note.isAccent && <circle cx={x} cy={cy} r={LANE_HEIGHT / 2 + 1} fill="none" stroke="#ffe066" strokeWidth={1.5} />}
          </g>
        );
      })}

      {hover && (
        <g pointerEvents="none">
          <line x1={hover.x} y1={0} x2={hover.x} y2={height} stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3,3" />
          <g transform={`translate(${tooltipX}, 4)`}>
            <rect width={tooltipWidth} height={tooltipHeight} rx={6} fill="#0d0f14" stroke="#3a3f4d" />
            <text x={10} y={18} fontSize={12} fontWeight={700} fill="#ffc83c">
              {t('highway.points', { n: Math.round(hover.score).toLocaleString(locale) })}
            </text>
            <text x={10} y={34} fontSize={10.5} fill="#8b8fa3">
              {formatDuration(hover.seconds)} · {t('highway.measureShort', { n: hover.measure.toFixed(1) })}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

export const DRUM_HIGHWAY_LAYOUT = { LANE_HEIGHT, LANE_GAP, TOP_MARGIN, BOTTOM_MARGIN };
/** Only the 4 real pad lanes - kick has no lane row of its own (see DrumHighway). */
export const DRUM_LANE_COLORS = [PAD_COLORS[1], PAD_COLORS[2], PAD_COLORS[3], PAD_COLORS[4]];
export const DRUM_KICK_COLOR = KICK_COLOR;
