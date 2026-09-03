const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Minimal pure-node PNG generator with zero dependencies
function createPng(width, height, drawPixel) {
  // 1. Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 2. IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdr = makeChunk('IHDR', ihdrData);

  // 3. Raw Scanlines
  const rawData = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData.writeUInt8(0, offset++); // Filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawPixel(x, y, width, height);
      rawData.writeUInt8(r, offset++);
      rawData.writeUInt8(g, offset++);
      rawData.writeUInt8(b, offset++);
      rawData.writeUInt8(a, offset++);
    }
  }

  // 4. IDAT
  const compressed = zlib.deflateSync(rawData);
  const idat = makeChunk('IDAT', compressed);

  // 5. IEND
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4);
  data.copy(chunk, 8);

  const crc = calculateCrc(Buffer.concat([Buffer.from(type), data]));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// CRC32 Table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function calculateCrc(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Drawer: Antigravity glowing cyber hexagon
function drawAntigravityIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = (x - cx) / (w / 2);
  const dy = (y - cy) / (h / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background rounded squircle / circle
  if (dist > 0.95) {
    return [0, 0, 0, 0]; // Transparent outside
  }

  // Indigo to cyan gradient background
  const t = (x + y) / (w + h);
  let r = Math.round(99 * (1 - t) + 6 * t);
  let g = Math.round(102 * (1 - t) + 182 * t);
  let b = Math.round(241 * (1 - t) + 212 * t);

  // Hexagon / Triangle glyph in center
  const innerDist = Math.sqrt(dx * dx + dy * dy);
  if (innerDist < 0.55 && innerDist > 0.25 && (Math.abs(dx) + Math.abs(dy) < 0.75)) {
    return [255, 255, 255, 255]; // White glowing glyph
  }
  if (innerDist <= 0.25) {
    return [15, 23, 42, 255]; // Dark center
  }

  return [r, g, b, 255];
}

const iconsDir = path.join(__dirname, '../chrome-extension/icons');
fs.mkdirSync(iconsDir, { recursive: true });

[16, 48, 128].forEach((size) => {
  const png = createPng(size, size, drawAntigravityIcon);
  const dest = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(dest, png);
  console.log(`Generated: icon${size}.png (${png.length} bytes)`);
});
