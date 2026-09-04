#!/usr/bin/env node
// Generates the extension icons (pink rounded square + white pin) as PNGs, no deps.
const zlib = require('zlib'), fs = require('fs'), path = require('path');

function crc32(buf) {
  let c, t = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = t[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22, cx = size / 2, cy = size * 0.44, pin = size * 0.17;
  const put = (x, y, c) => { const o = (y * size + x) * 4; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3]; };
  const inRound = (x, y) => {
    const m = size * 0.03, lo = m, hi = size - m;
    if (x < lo || y < lo || x > hi || y > hi) return false;
    const dx = Math.max(lo + r - x, 0, x - (hi - r)), dy = Math.max(lo + r - y, 0, y - (hi - r));
    return dx * dx + dy * dy <= r * r;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x + 0.5, fy = y + 0.5;
    if (!inRound(fx, fy)) { put(x, y, [0, 0, 0, 0]); continue; }
    const d = Math.hypot(fx - cx, fy - cy);
    const tail = fy > cy && Math.abs(fx - cx) < pin * (1 - (fy - cy) / (size * 0.42)) && fy < size * 0.86;
    put(x, y, (d < pin || tail) ? [255, 255, 255, 255] : [255, 45, 120, 255]);
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}
const out = path.join(__dirname, 'icons');
fs.mkdirSync(out, { recursive: true });
[16, 32, 48, 128].forEach(s => fs.writeFileSync(path.join(out, 'icon' + s + '.png'), png(s)));
console.log('icons: ' + fs.readdirSync(out).join(' '));
