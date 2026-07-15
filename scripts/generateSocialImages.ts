import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const FRET_COLORS = ['#3ddc3d', '#e8433f', '#f2d43d', '#3d8ef2', '#f2953d'];
const GOLD = '#ffc83c';
const PURPLE = '#a78bfa';
const BG = '#0a0b0f';
const PANEL = '#0d0f14';
const TEXT = '#f5f5f7';
const TEXT_DIM = '#9299ad';

function starPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const spikes = 5;
  const step = Math.PI / spikes;
  let rot = -Math.PI / 2;
  const pts: string[] = [];
  for (let i = 0; i < spikes; i++) {
    pts.push(`${(cx + Math.cos(rot) * outerR).toFixed(2)},${(cy + Math.sin(rot) * outerR).toFixed(2)}`);
    rot += step;
    pts.push(`${(cx + Math.cos(rot) * innerR).toFixed(2)},${(cy + Math.sin(rot) * innerR).toFixed(2)}`);
    rot += step;
  }
  return pts.join(' ');
}

// --- Deterministic "note highway" strip for the right-hand decorative panel ---
function buildHighwayNotes(panelX: number, panelWidth: number, laneY: number[], seed: number): string {
  let s = seed >>> 0;
  const rand = () => {
    // xorshift32 - avoids the low-bit periodicity of a basic LCG
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
  let svg = '';
  let x = panelX + 30;
  let laneCursor = 0;
  while (x < panelX + panelWidth - 30) {
    const laneCount = rand() < 0.3 ? 2 : 1;
    const usedLanes = new Set<number>();
    for (let i = 0; i < laneCount; i++) {
      // round-robin with jitter guarantees every lane gets covered, while still looking organic
      let lane = (laneCursor + Math.floor(rand() * 2)) % laneY.length;
      while (usedLanes.has(lane)) lane = (lane + 1) % laneY.length;
      usedLanes.add(lane);
      laneCursor = (lane + 1) % laneY.length;
      const cy = laneY[lane];
      const color = FRET_COLORS[lane];
      const isStar = rand() < 0.22;
      if (isStar) {
        svg += `<polygon points="${starPoints(x, cy, 15, 6.3)}" fill="${color}"/>`;
      } else {
        svg += `<circle cx="${x}" cy="${cy}" r="12" fill="${color}"/>`;
      }
      if (rand() < 0.35) {
        const sustainLen = 40 + rand() * 90;
        svg += `<rect x="${x}" y="${cy - 8}" width="${sustainLen.toFixed(0)}" height="16" rx="4" fill="${color}" opacity="0.4"/>`;
      }
    }
    x += 34 + rand() * 22;
  }
  return svg;
}

function buildOgImage(): string {
  const width = 1200;
  const height = 630;
  const panelX = 660;
  const panelWidth = width - panelX;
  const laneCount = 5;
  const laneGap = 14;
  const laneHeight = 46;
  const laneStartY = 90;
  const laneY = Array.from({ length: laneCount }, (_, i) => laneStartY + i * (laneHeight + laneGap) + laneHeight / 2);

  const iconCx = 146;
  const iconCy = 150;

  let lanes = '';
  for (const cy of laneY) {
    lanes += `<rect x="${panelX}" y="${cy - laneHeight / 2}" width="${panelWidth}" height="${laneHeight}" fill="#14161d"/>`;
  }

  const notesSvg = buildHighwayNotes(panelX, panelWidth, laneY, 42);

  const spBandY = laneStartY - 34;
  const spBand = `
    <rect x="${panelX}" y="${spBandY}" width="${panelWidth}" height="20" fill="${GOLD}" opacity="0.9"/>
    <text x="${panelX + 24}" y="${spBandY + 15}" font-family="Segoe UI, Arial, sans-serif" font-size="14" font-weight="700" fill="#2a1f00">OPTIMAL STAR POWER PATH · 8×</text>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="${width}" y2="${height}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#0d0a17"/>
        <stop offset="1" stop-color="${BG}"/>
      </linearGradient>
      <linearGradient id="panelFade" x1="${panelX}" y1="0" x2="${panelX + 90}" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${BG}"/>
        <stop offset="1" stop-color="${BG}" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="panelClip">
        <rect x="${panelX}" y="0" width="${panelWidth}" height="${height}"/>
      </clipPath>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#bg)"/>

    <g clip-path="url(#panelClip)">
      <rect x="${panelX}" y="0" width="${panelWidth}" height="${height}" fill="${PANEL}"/>
      ${lanes}
      ${notesSvg}
      ${spBand}
    </g>
    <rect x="${panelX}" y="0" width="90" height="${height}" fill="url(#panelFade)"/>

    <!-- icon badge -->
    <rect x="${iconCx - 58}" y="${iconCy - 58}" width="116" height="116" rx="26" fill="#121319" stroke="${PURPLE}" stroke-width="3"/>
    <polygon points="${starPoints(iconCx, iconCy, 40, 17)}" fill="${GOLD}"/>

    <text x="90" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="66" font-weight="800" fill="${TEXT}">Clone Hero</text>
    <text x="90" y="404" font-family="Segoe UI, Arial, sans-serif" font-size="66" font-weight="800" fill="${TEXT}">Chart Analyzer</text>

    <text x="90" y="462" font-family="Segoe UI, Arial, sans-serif" font-size="26" fill="${TEXT_DIM}">Calculates the maximum highscore &amp; the optimal</text>
    <text x="90" y="498" font-family="Segoe UI, Arial, sans-serif" font-size="26" fill="${TEXT_DIM}">Star Power path from your .chart or .mid file</text>

    <text x="90" y="560" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600" fill="${PURPLE}">.chart</text>
    <text x="164" y="560" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="${TEXT_DIM}">·</text>
    <text x="182" y="560" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600" fill="${PURPLE}">.mid</text>
    <text x="248" y="560" font-family="Segoe UI, Arial, sans-serif" font-size="22" fill="${TEXT_DIM}">·</text>
    <text x="266" y="560" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="600" fill="${PURPLE}">ZIP-Support</text>
  </svg>`;
}

async function main() {
  const ogSvg = buildOgImage();
  fs.writeFileSync(path.join(publicDir, '_og-image-source.svg'), ogSvg);
  await sharp(Buffer.from(ogSvg)).png().toFile(path.join(publicDir, 'og-image.png'));
  console.log('wrote og-image.png');

  const faviconSvg = fs.readFileSync(path.join(publicDir, 'favicon.svg'), 'utf-8');
  const faviconBuf = Buffer.from(faviconSvg);
  await sharp(faviconBuf).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));
  await sharp(faviconBuf).resize(32, 32).png().toFile(path.join(publicDir, 'favicon-32.png'));
  await sharp(faviconBuf).resize(192, 192).png().toFile(path.join(publicDir, 'favicon-192.png'));
  await sharp(faviconBuf).resize(512, 512).png().toFile(path.join(publicDir, 'favicon-512.png'));
  console.log('wrote favicon PNGs');

  fs.rmSync(path.join(publicDir, '_og-image-source.svg'));
}

main();
