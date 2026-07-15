import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChartFile } from '../src/parsers/chartParser';
import { parseMidFile } from '../src/parsers/midParser';
import { scoreTrackBase } from '../src/scoring/score';
import { optimizeStarPower } from '../src/scoring/optimizer';
import { TimingMap } from '../src/model/timing';
import type { ParsedChart } from '../src/model/chart';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const folderName = process.argv[2];
if (!folderName) {
  console.error('Usage: tsx scripts/testChart.ts "<folder name>" [realWR]');
  process.exit(1);
}
const realWR = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;

const folder = path.join(root, folderName);
const chartPath = path.join(folder, 'notes.chart');
const midPath = path.join(folder, 'notes.mid');

let chart: ParsedChart;
if (fs.existsSync(chartPath)) {
  chart = parseChartFile(fs.readFileSync(chartPath, 'utf-8'));
} else {
  const buf = fs.readFileSync(midPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  chart = parseMidFile(ab as ArrayBuffer);
}

console.log('name:', chart.name, 'artist:', chart.artist, 'resolution:', chart.resolution);
console.log('instruments:', chart.instruments.map((i) => `${i.instrument}[${Object.keys(i.difficulties).join(',')}]`));
console.log('lastTick:', chart.lastTick, 'tempos:', chart.tempos.length, 'timeSigs:', chart.timeSigs.length);

const timing = new TimingMap(chart);

const inst = chart.instruments.find((i) => i.instrument === 'Single') ?? chart.instruments[0];
const expert = inst.difficulties.Expert!;
console.log('instrument used:', inst.instrument);
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
    `  tick ${a.startTick}->${a.endTick.toFixed(1)} (${a.measures.toFixed(2)} measures, gauge ${a.gaugeUnitsUsed.toFixed(2)}/120) bonus=${Math.round(a.bonusPoints)}`,
  );
}

let ok = true;
for (let i = 1; i < result.activations.length; i++) {
  if (result.activations[i].startTick < result.activations[i - 1].endTick) {
    ok = false;
    console.log('OVERLAP between', i - 1, 'and', i);
  }
}
console.log('no overlaps:', ok);

console.log('song length (s):', timing.ticksToSeconds(chart.lastTick).toFixed(1));

if (realWR !== undefined) {
  const total = Math.round(result.totalScore);
  console.log(`\nReal WR: ${realWR}`);
  console.log(`Our max: ${total}`);
  console.log(`Diff: ${total - realWR} (${(((total / realWR) - 1) * 100).toFixed(2)}%)`);
  if (total < realWR) console.log('*** WARNING: our max is BELOW the real WR - this indicates a real bug! ***');
}
