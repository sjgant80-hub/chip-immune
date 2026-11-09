// src/mnist.mjs — MNIST digits as the settling cell's 8×8 ink grid, the way the optical digits were made: threshold the
// 28×28 grey image at 127, take the bounding box of the ink, fit it into a 32×32 square keeping its shape (centred,
// nearest pixel), then count the on-pixels in each 4×4 block (0..16). Whole numbers only. Pure and browser-safe: it takes
// the bytes of the decompressed idx files. A malformed file gives an empty result, never a throw.
export const SRC = 28, BOX = 32, GRID = 8, CELL = 4, CUT = 127;

const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

/** inkOf(img) → the 64 ink counts of one 28×28 grey image (row-major bytes). */
export function inkOf(img) {
  let r0 = SRC, r1 = -1, c0 = SRC, c1 = -1;
  for (let r = 0; r !== SRC; r++) for (let c = 0; c !== SRC; c++) if (img[r * SRC + c] > CUT) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  const ink = new Array(GRID * GRID).fill(0);
  if (r1 === -1) return ink;
  const h = r1 - r0 + 1, w = c1 - c0 + 1, s = Math.max(h, w), top = r0 - ((s - h) >> 1), left = c0 - ((s - w) >> 1);
  for (let ty = 0; ty !== BOX; ty++) for (let tx = 0; tx !== BOX; tx++) {
    const sy = top + Math.floor((ty * s) / BOX), sx = left + Math.floor((tx * s) / BOX);
    if (sy >= 0 && sy < SRC && sx >= 0 && sx < SRC && img[sy * SRC + sx] > CUT) ink[(ty >> 2) * GRID + (tx >> 2)]++;
  }
  return ink;
}

/** parse(images, labels) → { x, y }: every digit of an idx3 image file and its idx1 label file, as ink grids. */
export function parse(images, labels) {
  if (!images || !labels || images.length < 16 || labels.length < 8 || u32(images, 0) !== 2051 || u32(labels, 0) !== 2049) return { x: [], y: [] };
  const n = u32(images, 4);
  if (u32(labels, 4) !== n || u32(images, 8) !== SRC || u32(images, 12) !== SRC || images.length !== 16 + n * SRC * SRC || labels.length !== 8 + n) return { x: [], y: [] };
  const x = [], y = [];
  for (let i = 0; i !== n; i++) { x.push(inkOf(images.subarray(16 + i * SRC * SRC, 16 + (i + 1) * SRC * SRC))); y.push(labels[8 + i]); }
  return { x, y };
}

export default { SRC, BOX, GRID, CELL, CUT, inkOf, parse };
