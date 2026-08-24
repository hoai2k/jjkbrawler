// Just enough PNG to read a sprite's pixels in node.
//
// The sprite tools that need pixels have always needed a browser for them,
// because node here has no imaging library and the repo has no dependencies
// beyond playwright. That is fine for a tool somebody runs; it is too much for
// something that has to run inside `npm run check`, which is plain node and
// finishes in seconds.
//
// So: 8-bit RGBA, non-interlaced, which is what every sprite in
// `sprites/assets/` is. Anything else throws by name rather than decoding to
// quiet nonsense — a check that silently mis-read its input would be worse
// than no check.

import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Decode one PNG file to `{ width, height, data }`, `data` being RGBA bytes —
 *  the same shape as a canvas ImageData, so it can be handed straight to
 *  anything written against one. */
export function readPng(file) {
  const buf = readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error(`${file}: not a PNG`);

  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  for (let at = 8; at + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString("ascii", at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    at += 12 + len;               // length + type + body + CRC
  }

  if (depth !== 8) throw new Error(`${file}: ${depth}-bit PNG, expected 8`);
  if (colorType !== 6 && colorType !== 2) {
    throw new Error(`${file}: colour type ${colorType}, expected 6 (RGBA) or 2 (RGB)`);
  }
  if (interlace !== 0) throw new Error(`${file}: interlaced PNG`);

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4, 255);

  // Undo the per-scanline filters. Each row is prefixed with its filter byte
  // and predicts from the pixel to its left (a), the row above (b), and above-
  // left (c) — PNG spec 9.2.
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  for (let y = 0, at = 0; y < height; y++) {
    const filter = raw[at++];
    raw.copy(line, 0, at, at + stride);
    at += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      let add = 0;
      switch (filter) {
        case 0: add = 0; break;
        case 1: add = a; break;
        case 2: add = b; break;
        case 3: add = (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default: throw new Error(`${file}: unknown row filter ${filter}`);
      }
      line[i] = (line[i] + add) & 0xff;
    }
    line.copy(prev);
    // Widen RGB to RGBA on the way out; the alpha bytes are already 255.
    if (channels === 4) line.copy(out, y * width * 4);
    else for (let x = 0; x < width; x++) line.copy(out, (y * width + x) * 4, x * 3, x * 3 + 3);
  }

  return { width, height, data: new Uint8ClampedArray(out) };
}
