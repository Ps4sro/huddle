// Generates Huddle's app icons from a single geometry description.
//
//   node scripts/make-icons.mjs
//
// Writes public/icon.svg and rasterized PNGs (no dependencies: shapes are
// rendered with plain math, 4x4 supersampled, and encoded with node:zlib).

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public');
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// Geometry (512 x 512 design grid)
// ---------------------------------------------------------------------------

const BG = '#0b0d12';
const GRAD_FROM = '#7c5cff';
const GRAD_TO = '#22d3ee';
const GRAD = { x1: 96, y1: 120, x2: 416, y2: 400 }; // pre-transform coords
const CORNER_RADIUS = 112;
const GLYPH_SCALE = 0.86; // keeps the glyph inside the maskable safe zone
const SIDE_OPACITY = 0.6;
const GAP = 12; // background-coloured outline separating the front person

// A "person" = head circle + shoulders (a circle clipped at y <= baseline).
const BASELINE = 372;
const center = { head: { cx: 256, cy: 196, r: 58 }, body: { cx: 256, cy: 388, r: 108 } };
const left = { head: { cx: 146, cy: 222, r: 44 }, body: { cx: 146, cy: 370, r: 82 } };
const right = {
  head: { ...left.head, cx: 512 - left.head.cx },
  body: { ...left.body, cx: 512 - left.body.cx },
};

// ---------------------------------------------------------------------------
// SVG
// ---------------------------------------------------------------------------

const fmt = (n) => Number(n.toFixed(2)).toString();

function bodyPath({ cx, cy, r }) {
  const dy = BASELINE - cy;
  const hw = Math.sqrt(r * r - dy * dy);
  const largeArc = cy < BASELINE ? 1 : 0; // centre above the chord → major arc
  return `M${fmt(cx - hw)} ${BASELINE}A${r} ${r} 0 ${largeArc} 1 ${fmt(cx + hw)} ${BASELINE}Z`;
}

function personSvg(p, attrs = '') {
  return (
    `<circle cx="${p.head.cx}" cy="${p.head.cy}" r="${p.head.r}"${attrs}/>` +
    `<path d="${bodyPath(p.body)}"${attrs}/>`
  );
}

function makeSvg({ fullBleed = false } = {}) {
  const t = `translate(256 256) scale(${GLYPH_SCALE}) translate(-256 -256)`;
  const bg = fullBleed
    ? `<rect width="512" height="512" fill="${BG}"/>`
    : `<rect width="512" height="512" rx="${CORNER_RADIUS}" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${GRAD.x1}" y1="${GRAD.y1}" x2="${GRAD.x2}" y2="${GRAD.y2}"><stop offset="0" stop-color="${GRAD_FROM}"/><stop offset="1" stop-color="${GRAD_TO}"/></linearGradient></defs>
${bg}
<g transform="${t}">
<g fill="url(#g)" opacity="${SIDE_OPACITY}">${personSvg(left)}${personSvg(right)}</g>
<g fill="${BG}" stroke="${BG}" stroke-width="${GAP * 2}">${personSvg(center)}</g>
<g fill="url(#g)">${personSvg(center)}</g>
</g>
</svg>
`;
}

// ---------------------------------------------------------------------------
// Rasterizer
// ---------------------------------------------------------------------------

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const bgRgb = hex(BG);
const fromRgb = hex(GRAD_FROM);
const toRgb = hex(GRAD_TO);

const dist = (x, y, c) => Math.hypot(x - c.cx, y - c.cy);
// Signed-ish distance to a person shape (negative/zero = inside).
function personDist(x, y, p) {
  const dHead = dist(x, y, p.head) - p.head.r;
  const dBody = Math.max(dist(x, y, p.body) - p.body.r, y - BASELINE);
  return Math.min(dHead, dBody);
}

function gradient(x, y) {
  const vx = GRAD.x2 - GRAD.x1;
  const vy = GRAD.y2 - GRAD.y1;
  let t = ((x - GRAD.x1) * vx + (y - GRAD.y1) * vy) / (vx * vx + vy * vy);
  t = Math.min(1, Math.max(0, t));
  return fromRgb.map((c, i) => c + (toRgb[i] - c) * t);
}

/** Returns premultiplied [r, g, b, a] (0..255, a 0..1) for a point on the 512 grid. */
function shade(x, y, fullBleed) {
  if (!fullBleed) {
    const qx = Math.max(Math.abs(x - 256) - (256 - CORNER_RADIUS), 0);
    const qy = Math.max(Math.abs(y - 256) - (256 - CORNER_RADIUS), 0);
    if (Math.hypot(qx, qy) > CORNER_RADIUS) return [0, 0, 0, 0];
  }
  // Undo the glyph transform.
  const gx = (x - 256) / GLYPH_SCALE + 256;
  const gy = (y - 256) / GLYPH_SCALE + 256;

  const dCenter = personDist(gx, gy, center);
  if (dCenter <= 0) return [...gradient(gx, gy), 1];
  if (dCenter > GAP && (personDist(gx, gy, left) <= 0 || personDist(gx, gy, right) <= 0)) {
    const g = gradient(gx, gy);
    return [...g.map((c, i) => bgRgb[i] * (1 - SIDE_OPACITY) + c * SIDE_OPACITY), 1];
  }
  return [...bgRgb, 1];
}

function render(size, { fullBleed = false } = {}) {
  const S = 4; // 4x4 supersampling
  const px = Buffer.alloc(size * size * 4);
  const k = 512 / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const [cr, cg, cb, ca] = shade((i + (sx + 0.5) / S) * k, (j + (sy + 0.5) / S) * k, fullBleed);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const o = (j * size + i) * 4;
      if (a > 0) {
        px[o] = Math.round(r / a);
        px[o + 1] = Math.round(g / a);
        px[o + 2] = Math.round(b / a);
      }
      px[o + 3] = Math.round((a / (S * S)) * 255);
    }
  }
  return encodePng(size, size, px);
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder (RGBA8, no filtering)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const outputs = [
  ['icon.svg', () => makeSvg()],
  ['icon-192.png', () => render(192)],
  ['icon-512.png', () => render(512)],
  ['icon-maskable-192.png', () => render(192, { fullBleed: true })],
  ['icon-maskable-512.png', () => render(512, { fullBleed: true })],
  // iOS applies its own rounded mask and turns transparency black: full bleed.
  ['apple-touch-icon.png', () => render(180, { fullBleed: true })],
];

for (const [name, make] of outputs) {
  const data = make();
  writeFileSync(path.join(outDir, name), data);
  console.log(`wrote public/${name} (${data.length} bytes)`);
}
