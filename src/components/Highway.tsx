import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { DifficultyTrack } from '../model/chart';
import type { TimingMap } from '../model/timing';
import type { Activation } from '../scoring/optimizer';
import { ScoreRangeIndex, SOLO_MAX_BONUS_PER_NOTE, CLEAN_PLAY_BONUS_PER_NOTE } from '../scoring/score';
import { formatDuration } from '../model/stats';
import { useLanguage } from '../i18n/LanguageContext';

const FRET_COLORS = ['#3ddc3d', '#e8433f', '#f2d43d', '#3d8ef2', '#f2953d'];
const OPEN_COLOR = '#b45cf0';
const LANE_HEIGHT = 26;
const LANE_GAP = 4;
const TOP_MARGIN = 34; // SP phrase + activation strip
const BOTTOM_MARGIN = 22; // measure labels

interface Props {
  track: DifficultyTrack;
  timing: TimingMap;
  resolution: number;
  lastTick: number;
  activations: Activation[];
  usedPhraseIndices: Set<number>;
  scoreIndex: ScoreRangeIndex;
  pxPerTick: number;
}

/** Points for a 5-pointed star polygon centered at (cx, cy). */
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

export function Highway({ track, timing, lastTick, activations, usedPhraseIndices, scoreIndex, pxPerTick }: Props) {
  const { t, locale } = useLanguage();
  const width = Math.max(800, lastTick * pxPerTick + 200);
  const laneCount = 5;
  const height = TOP_MARGIN + laneCount * (LANE_HEIGHT + LANE_GAP) + BOTTOM_MARGIN;
  const laneY = (fret: number) => TOP_MARGIN + fret * (LANE_HEIGHT + LANE_GAP);
  const openY = TOP_MARGIN;
  const openHeight = laneCount * (LANE_HEIGHT + LANE_GAP) - LANE_GAP;

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

  // Sorted ticks of every note that lies within a solo section, for a fast
  // "how many solo notes have been hit by tick T" lookup on hover.
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

  const allNoteTicks = useMemo(() => track.notes.map((n) => n.tick).sort((a, b) => a - b), [track]);

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
    const soloBonus = upperBound(soloNoteTicks, tick) * SOLO_MAX_BONUS_PER_NOTE;
    const cleanBonus = upperBound(allNoteTicks, tick) * CLEAN_PLAY_BONUS_PER_NOTE;
    return base + spBonus + soloBonus + cleanBonus;
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
  }, [hoverTick, pxPerTick, timing, scoreIndex, activations, soloNoteTicks, allNoteTicks]);

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

      {/* measure gridlines */}
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

      {/* lane baselines */}
      {[0, 1, 2, 3, 4].map((f) => (
        <line
          key={f}
          x1={0}
          y1={laneY(f) + LANE_HEIGHT / 2}
          x2={width}
          y2={laneY(f) + LANE_HEIGHT / 2}
          stroke="#1a1e27"
          strokeWidth={LANE_HEIGHT}
        />
      ))}

      {/* star power phrases */}
      {track.starPower.map((sp, i) => (
        <rect
          key={i}
          x={sp.tick * pxPerTick}
          y={TOP_MARGIN}
          width={Math.max(1, sp.length * pxPerTick)}
          height={laneCount * (LANE_HEIGHT + LANE_GAP)}
          fill={usedPhraseIndices.has(i) ? 'rgba(140, 110, 255, 0.22)' : 'rgba(140, 110, 255, 0.10)'}
          stroke={usedPhraseIndices.has(i) ? '#a78bfa' : '#5b4d8f'}
          strokeWidth={1}
        />
      ))}

      {/* optimal SP activation windows */}
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

      {/* solos */}
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

      {/* notes */}
      {track.notes.map((note, i) => {
        const x = note.tick * pxPerTick;
        const hasSustain = note.length > 0;
        const sustainWidth = note.length * pxPerTick;

        const isTap = note.isTap;
        const isHopoOnly = note.isHopo && !isTap;
        const isStarPower = isInStarPower(note.tick);

        if (note.isOpen) {
          const barOpacity = isTap ? 0.5 : 1;
          return (
            <g key={i}>
              {hasSustain && (
                <rect
                  x={x}
                  y={openY + 6}
                  width={sustainWidth}
                  height={openHeight - 12}
                  fill={OPEN_COLOR}
                  opacity={barOpacity * 0.35}
                />
              )}
              <rect x={x - 4} y={openY} width={8} height={openHeight} fill={OPEN_COLOR} opacity={barOpacity} rx={2} />
              {isStarPower && (
                <polygon
                  points={starPoints(x, openY + openHeight / 2, 8, 3.5)}
                  fill={isHopoOnly ? '#ffffff' : '#ffe066'}
                  opacity={barOpacity}
                />
              )}
              {isHopoOnly && !isStarPower && <circle cx={x} cy={openY + openHeight / 2} r={4} fill="#ffffff" />}
            </g>
          );
        }

        return (
          <g key={i}>
            {note.frets.map((fret, fretIdx) => {
              const cy = laneY(fret) + LANE_HEIGHT / 2;
              const noteOpacity = isTap ? 0.5 : 1;
              // A "disjoint" chord (frets with different sustain lengths) draws each fret's
              // own sustain bar at its own length, not stretched to match the longest.
              const fretLength = note.fretLengths[fretIdx] ?? note.length;
              const fretHasSustain = fretLength > 0;
              const fretSustainWidth = fretLength * pxPerTick;
              return (
                <g key={fret}>
                  {fretHasSustain && (
                    <rect
                      x={x}
                      y={laneY(fret) + 6}
                      width={fretSustainWidth}
                      height={LANE_HEIGHT - 12}
                      fill={FRET_COLORS[fret]}
                      opacity={0.45}
                    />
                  )}
                  {isStarPower ? (
                    <polygon
                      points={starPoints(x, cy, LANE_HEIGHT / 2 - 1, (LANE_HEIGHT / 2 - 1) * 0.42)}
                      fill={FRET_COLORS[fret]}
                      opacity={noteOpacity}
                      stroke="#00000055"
                      strokeWidth={1}
                    />
                  ) : (
                    <circle
                      cx={x}
                      cy={cy}
                      r={LANE_HEIGHT / 2 - 3}
                      fill={FRET_COLORS[fret]}
                      opacity={noteOpacity}
                      stroke="#00000055"
                      strokeWidth={1}
                    />
                  )}
                  {isHopoOnly && <circle cx={x} cy={cy} r={3.5} fill="#ffffff" />}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* hover cursor + running score tooltip */}
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

export const HIGHWAY_LAYOUT = { LANE_HEIGHT, LANE_GAP, TOP_MARGIN, BOTTOM_MARGIN };
export const FRET_LABEL_COLORS = FRET_COLORS;
