import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
mkdirSync(publicDir, { recursive: true });

const BG = [14, 165, 233]; // #0ea5e9
const WHITE = [255, 255, 255];

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let tval = ((px - ax) * dx + (py - ay) * dy) / len2;
  tval = Math.max(0, Math.min(1, tval));
  const cx = ax + tval * dx;
  const cy = ay + tval * dy;
  return Math.hypot(px - cx, py - cy);
}

function buildPixels(size) {
  const data = Buffer.alloc(size * size * 4);
  const r = size * 0.22; // corner radius
  const stroke = size * 0.085;
  // checkmark points
  const p = [
    [0.28 * size, 0.53 * size],
    [0.43 * size, 0.68 * size],
    [0.73 * size, 0.34 * size],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // rounded-rect mask
      const cx = Math.min(Math.max(x, r), size - r);
      const cy = Math.min(Math.max(y, r), size - r);
      const inside =
        x >= r && x <= size - r
          ? true
          : y >= r && y <= size - r
            ? true
            : Math.hypot(x - cx, y - cy) <= r;
      if (!inside) {
        data[i + 3] = 0;
        continue;
      }
      const d = Math.min(
        distToSegment(x, y, p[0][0], p[0][1], p[1][0], p[1][1]),
        distToSegment(x, y, p[1][0], p[1][1], p[2][0], p[2][1]),
      );
      const color = d <= stroke / 2 ? WHITE : BG;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = 255;
    }
  }
  return data;
}

// --- minimal PNG encoder ---
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // scanlines with filter byte 0
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function write(name, size) {
  const png = encodePng(size, buildPixels(size));
  writeFileSync(join(publicDir, name), png);
  console.log(`wrote ${name} (${size}x${size}, ${png.length} bytes)`);
}

write('pwa-512x512.png', 512);
write('pwa-192x192.png', 192);
write('apple-touch-icon.png', 180);

// favicon as SVG
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0ea5e9"/>
  <path d="M18 34 L28 44 L47 22" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
writeFileSync(join(publicDir, 'favicon.svg'), favicon);
console.log('wrote favicon.svg');
