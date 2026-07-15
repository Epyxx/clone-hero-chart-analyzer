import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChartFile } from '../src/parsers/chartParser';
import { parseMidFile } from '../src/parsers/midParser';
import { scoreTrackBase } from '../src/scoring/score';
import { optimizeStarPower } from '../src/scoring/optimizer';
import { TimingMap } from '../src/model/timing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

function run(label: string, chart: ReturnType<typeof parseChartFile>) {
  console.log(`\n=== ${label} ===`);
  console.log('name:', chart.name, 'artist:', chart.artist, 'resolution:', chart.resolution);
  console.log('instruments:', chart.instruments.map((i) => `${i.instrument}[${Object.keys(i.difficulties).join(',')}]`));
  const timing = new TimingMap(chart);

  for (const inst of chart.instruments) {
    const expert = inst.difficulties.Expert;
    if (!expert) continue;
    console.log(`-- ${inst.instrument} Expert --`);
    console.log('notes:', expert.notes.length, 'SP phrases:', expert.starPower.length, 'solos:', expert.solos.length);
    const scored = scoreTrackBase(expert, chart.resolution);
    console.log('base score (no SP):', Math.round(scored.baseScoreNoStarPower), 'solo bonus:', scored.soloBonus);
    const result = optimizeStarPower(expert, scored, timing, chart.resolution);
    console.log('optimal total score:', Math.round(result.totalScore), 'SP bonus:', Math.round(result.starPowerBonus));
    console.log('activations:', result.activations.length);
    for (const a of result.activations.slice(0, 5)) {
      console.log(
        `  tick ${a.startTick}->${a.endTick} (${a.measures.toFixed(2)} measures, gauge ${a.gaugeUnitsUsed}/120) bonus=${Math.round(a.bonusPoints)}`,
      );
    }
  }
}

const chartPath = path.join(root, 'Epica - Crimson Bow and Arrow', 'notes.chart');
const chartText = fs.readFileSync(chartPath, 'utf-8');
run('Epica .chart', parseChartFile(chartText));

const midPath = path.join(root, 'Babymetal - Ratatata (ft. Electric Callboy) (Ghostbyob)', 'notes.mid');
const midBuffer = fs.readFileSync(midPath);
const arrayBuffer = midBuffer.buffer.slice(midBuffer.byteOffset, midBuffer.byteOffset + midBuffer.byteLength);
run('Babymetal .mid', parseMidFile(arrayBuffer as ArrayBuffer));

// Sanity check: DP result should never be worse than a naive "activate ASAP, per phrase" greedy.
import { ScoreRangeIndex } from '../src/scoring/score';
import type { DifficultyTrack } from '../src/model/chart';
import type { ScoredTrack } from '../src/scoring/score';

function greedyBonus(track: DifficultyTrack, scored: ScoredTrack, timing: TimingMap, resolution: number) {
  const idx = new ScoreRangeIndex(scored);
  let gauge = 0;
  let bonus = 0;
  for (const phrase of track.starPower) {
    const phraseEnd = phrase.tick + phrase.length;
    let whammyTicks = 0;
    for (const note of track.notes) {
      if (note.length <= 0) continue;
      const overlap = Math.min(note.tick + note.length, phraseEnd) - Math.max(note.tick, phrase.tick);
      if (overlap > 0) whammyTicks += overlap;
    }
    const units = 30 + (whammyTicks * 4) / resolution;
    gauge = Math.min(120, gauge + units);
    if (gauge >= 60) {
      const measures = gauge / 15;
      const endTick = timing.addMeasures(phraseEnd, measures);
      bonus += idx.scoreInRange(phraseEnd, endTick);
      gauge = 0;
    }
  }
  return bonus;
}

console.log('\n=== Greedy vs DP sanity check ===');
{
  const chart = parseChartFile(chartText);
  const timing = new TimingMap(chart);
  const expert = chart.instruments[0].difficulties.Expert!;
  const scored = scoreTrackBase(expert, chart.resolution);
  const dp = optimizeStarPower(expert, scored, timing, chart.resolution);
  const greedy = greedyBonus(expert, scored, timing, chart.resolution);
  console.log('Epica: DP bonus =', Math.round(dp.starPowerBonus), ' greedy bonus =', Math.round(greedy), ' DP>=greedy:', dp.starPowerBonus >= greedy - 1e-6);
}

// Sanity check: activation windows must be non-overlapping and chronological.
console.log('\n=== Activation window sanity check ===');
{
  const midPath2 = path.join(root, 'Babymetal - Ratatata (ft. Electric Callboy) (Ghostbyob)', 'notes.mid');
  const buf2 = fs.readFileSync(midPath2);
  const ab2 = buf2.buffer.slice(buf2.byteOffset, buf2.byteOffset + buf2.byteLength);
  const chart2 = parseMidFile(ab2 as ArrayBuffer);
  const timing2 = new TimingMap(chart2);
  const track2 = chart2.instruments.find(i => i.instrument === 'Single')!.difficulties.Expert!;
  const scored2 = scoreTrackBase(track2, chart2.resolution);
  const result2 = optimizeStarPower(track2, scored2, timing2, chart2.resolution);
  let ok = true;
  for (let i = 1; i < result2.activations.length; i++) {
    if (result2.activations[i].startTick < result2.activations[i - 1].endTick) {
      ok = false;
      console.log('OVERLAP between activation', i - 1, 'and', i);
    }
  }
  console.log('no overlaps:', ok);
  console.log('gauge used per activation (should be 60-120):', result2.activations.map(a => a.gaugeUnitsUsed.toFixed(1)));
  console.log('sum of activation bonusPoints:', result2.activations.reduce((s, a) => s + a.bonusPoints, 0).toFixed(0), 'vs starPowerBonus:', result2.starPowerBonus.toFixed(0));
}

// Hover cumulative score sanity check (mirrors Highway.tsx cumulativeScoreAt)
import { ScoreRangeIndex as SRI, SOLO_MAX_BONUS_PER_NOTE as SOLO_PTS, CLEAN_PLAY_BONUS_PER_NOTE as CLEAN_PTS } from '../src/scoring/score';
console.log('\n=== Hover cumulative score check (Epica, tick 6000) ===');
{
  const chart = parseChartFile(chartText);
  const timing = new TimingMap(chart);
  const expert = chart.instruments[0].difficulties.Expert!;
  const scored = scoreTrackBase(expert, chart.resolution);
  const idx = new SRI(scored);
  const result = optimizeStarPower(expert, scored, timing, chart.resolution);
  const tick = 6000;
  const base = idx.scoreInRange(-Infinity, tick);
  let spBonus = 0;
  for (const a of result.activations) {
    if (tick <= a.startTick) continue;
    spBonus += tick >= a.endTick ? a.bonusPoints : idx.scoreInRange(a.startTick, tick);
  }
  let soloBonus = 0;
  for (const solo of expert.solos) {
    const soloEnd = solo.tick + solo.length;
    for (const n of expert.notes) if (n.tick >= solo.tick && n.tick < soloEnd && n.tick <= tick) soloBonus += SOLO_PTS;
  }
  const cleanBonus = expert.notes.filter(n => n.tick <= tick).length * CLEAN_PTS;
  console.log('base:', base, 'spBonus:', spBonus, 'soloBonus:', soloBonus, 'cleanBonus:', cleanBonus, 'total:', base+spBonus+soloBonus+cleanBonus);
  const notesBefore = expert.notes.filter(n => n.tick <= tick);
  console.log('notes up to tick 6000:', notesBefore.length, notesBefore.map(n=>({tick:n.tick,frets:n.frets,len:n.length})));
}

console.log('\n=== Hover check inside SP activation (tick 65000) ===');
{
  const chart = parseChartFile(chartText);
  const timing = new TimingMap(chart);
  const expert = chart.instruments[0].difficulties.Expert!;
  const scored = scoreTrackBase(expert, chart.resolution);
  const idx = new SRI(scored);
  const result = optimizeStarPower(expert, scored, timing, chart.resolution);
  const tick = 65000;
  const base = idx.scoreInRange(-Infinity, tick);
  let spBonus = 0;
  for (const a of result.activations) {
    if (tick <= a.startTick) continue;
    spBonus += tick >= a.endTick ? a.bonusPoints : idx.scoreInRange(a.startTick, tick);
  }
  const cleanBonus = expert.notes.filter(n => n.tick <= tick).length * CLEAN_PTS;
  console.log('base:', Math.round(base), 'spBonus:', Math.round(spBonus), 'cleanBonus:', cleanBonus, 'total:', Math.round(base+spBonus+cleanBonus));
}

console.log('\n=== Real-game verification: first 3 notes of Epica (expect 212, 424, 636) ===');
{
  const chart = parseChartFile(chartText);
  const expert = chart.instruments[0].difficulties.Expert!;
  const scored = scoreTrackBase(expert, chart.resolution);
  let cum = 0;
  for (let i = 0; i < 3; i++) {
    cum += scored.notes[i].hitPoints + scored.notes[i].sustainBasePoints + CLEAN_PTS;
    console.log(`note ${i + 1}: cumulative =`, cum);
  }
}
