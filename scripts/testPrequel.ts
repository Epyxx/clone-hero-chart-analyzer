import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChartFile } from '../src/parsers/chartParser';
import { scoreTrackBase } from '../src/scoring/score';
import { optimizeStarPower } from '../src/scoring/optimizer';
import { TimingMap } from '../src/model/timing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const chartPath = path.join(root, 'Prequel', 'notes.chart');
const chartText = fs.readFileSync(chartPath, 'utf-8');
const chart = parseChartFile(chartText);

console.log('name:', chart.name, 'artist:', chart.artist, 'resolution:', chart.resolution);
console.log('instruments:', chart.instruments.map((i) => `${i.instrument}[${Object.keys(i.difficulties).join(',')}]`));
console.log('lastTick:', chart.lastTick, 'tempos:', chart.tempos.length, 'timeSigs:', chart.timeSigs.length);

const timing = new TimingMap(chart);

const inst = chart.instruments.find((i) => i.instrument === 'Single')!;
const expert = inst.difficulties.Expert!;
console.log('notes:', expert.notes.length, 'SP phrases:', expert.starPower.length, 'solos:', expert.solos.length);

const scored = scoreTrackBase(expert, chart.resolution);
console.log('base (tier only):', Math.round(scored.baseScoreNoStarPower));
console.log('solo bonus:', scored.soloBonus);
console.log('clean play bonus:', scored.cleanPlayBonus);

const result = optimizeStarPower(expert, scored, timing, chart.resolution);
console.log('SP bonus:', Math.round(result.starPowerBonus));
console.log('TOTAL:', Math.round(result.totalScore));
console.log('activations:', result.activations.length);
for (const a of result.activations) {
  console.log(
    `  tick ${a.startTick}->${a.endTick} (${a.measures.toFixed(2)} measures, gauge ${a.gaugeUnitsUsed.toFixed(1)}/120) bonus=${Math.round(a.bonusPoints)}`,
  );
}

// Sanity: song length in seconds vs song.ini
console.log('song length (s):', timing.ticksToSeconds(chart.lastTick).toFixed(1));

console.log('\n=== Overlap check ===');
let ok = true;
for (let i = 1; i < result.activations.length; i++) {
  if (result.activations[i].startTick < result.activations[i-1].endTick) {
    ok = false;
    console.log('OVERLAP between', i-1, 'and', i);
  }
}
console.log('no overlaps:', ok);
console.log('sum of activation bonusPoints:', result.activations.reduce((s,a)=>s+a.bonusPoints,0), 'vs starPowerBonus:', result.starPowerBonus);

console.log('\nReal WR (fehlerfrei, Platz 1): 478874');
console.log('Unser theoretisches Maximum:', Math.round(result.totalScore));
console.log('Differenz:', Math.round(result.totalScore) - 478874, `(${(((result.totalScore/478874)-1)*100).toFixed(2)}%)`);
