// src/cell.mjs — the settling cell, Rung 1 of the geometric ladder. A digit becomes bits; the bits settle in an energy
// landscape shaped by a few stored patterns per class; the answer is the class whose patterns hold the settled state.
// Whole numbers only (no floating point in the settle), so the same input settles to the same bits on any engine.
// Pure and browser-safe: no file system, no network. Garbage in gives null / an empty result, never a throw.
// Sealed first: CLAIMS.md (seal 1, ed3e7f5). The rng is the estate's own (vendor/seed-library, byte for byte).
import { rng } from '../vendor/seed-library/seedlib.mjs';

export const PIXELS = 64, CLASSES = 10, MAXV = 16, MAX_ROUNDS = 25, MAX_SWEEPS = 64;
export const THRESHOLDS = Object.freeze({ 1: Object.freeze([8]), 2: Object.freeze([5, 11]), 4: Object.freeze([2, 6, 10, 14]) });

const FIELD = /^\d{1,2}$/;
const isBits = (v) => v instanceof Uint8Array;

/** parse(text) → { x, y, bad }: x = 64 ink counts per digit, y = its class. A malformed line is counted, not thrown. */
export function parse(text) {
  const x = [], y = [];
  let bad = 0;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split(',');
    if (f.length !== PIXELS + 1 || !f.every((s) => FIELD.test(s))) { bad++; continue; }
    const v = f.map(Number);
    if (v.slice(0, PIXELS).some((p) => p > MAXV) || v[PIXELS] >= CLASSES) { bad++; continue; }
    x.push(v.slice(0, PIXELS));
    y.push(v[PIXELS]);
  }
  return { x, y, bad };
}

/** encode(pixels, b) → N = 64·b bits by the sealed thermometer code (bit on when ink ≥ its threshold), or null. */
export function encode(pixels, b) {
  const T = THRESHOLDS[b];
  if (!T || !Array.isArray(pixels) || pixels.length !== PIXELS) return null;
  const bits = new Uint8Array(PIXELS * b);
  for (let p = 0; p !== PIXELS; p++) for (let j = 0; j !== b; j++) bits[p * b + j] = pixels[p] >= T[j] ? 1 : 0;
  return bits;
}

/** inkOf(bits, b) → the 64 pixel levels the bits stand for (0..b): how many of each pixel's bits are on. */
export function inkOf(bits, b) {
  const out = [];
  for (let p = 0; p !== PIXELS; p++) { let c = 0; for (let j = 0; j !== b; j++) c += bits[p * b + j]; out.push(c); }
  return out;
}

/** hamming(a, b) → how many bits differ. */
export function hamming(a, b) {
  let d = 0;
  for (let i = 0; i !== a.length; i++) d += a[i] ^ b[i];
  return d;
}

/** pack(bits) → the bits in 32-bit words (bit i in word i>>5, place i&31), so distances become XOR + popcount. */
export function pack(bits) {
  const w = new Uint32Array((bits.length + 31) >>> 5);
  for (let i = 0; i !== bits.length; i++) if (bits[i]) w[i >>> 5] |= 1 << (i & 31);
  return w;
}
/** popcount(v) → how many bits of a 32-bit word are on. */
export function popcount(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}
/** hammingW(a, b) → hamming on packed words. */
export function hammingW(a, b) {
  let d = 0;
  for (let w = 0; w !== a.length; w++) d += popcount(a[w] ^ b[w]);
  return d;
}

/** kernel(N, R, n) → K[d] = max(R − d, 0)^n for d = 0..N, exact whole numbers; null if R or n is out of range. */
export function kernel(N, R, n) {
  if (!Number.isInteger(N) || !Number.isInteger(R) || !Number.isInteger(n) || N < 1 || R < 1 || R > N || n < 1 || n > 8) return null;
  const K = new Float64Array(N + 1);
  for (let d = 0; d !== R; d++) { let v = 1; for (let t = 0; t !== n; t++) v *= R - d; K[d] = v; }
  return K;
}

/** majority(members, keep) → the bitwise majority; a tied bit keeps `keep`'s bit (or 0 when there is no keep). */
export function majority(members, keep = null) {
  const N = members[0].length, out = new Uint8Array(N);
  for (let i = 0; i !== N; i++) {
    let c = 0;
    for (const m of members) c += m[i];
    out[i] = 2 * c > members.length ? 1 : 2 * c === members.length && keep ? keep[i] : 0;
  }
  return out;
}

/** nearestIndex(pool, w) → the index of the packed pool pattern nearest to packed w (the lowest index on a tie). */
export function nearestIndex(pool, w) {
  let best = -1, bd = Infinity;
  for (let j = 0; j !== pool.length; j++) { const d = hammingW(pool[j], w); if (d < bd) { bd = d; best = j; } }
  return best;
}

/** growClass(P, k) → up to k memories from one class's patterns, by the sealed deterministic Hamming k-modes. */
export function growClass(P, k) {
  if (!Array.isArray(P) || P.length === 0 || !Number.isInteger(k) || k < 1) return [];
  const want = Math.min(k, P.length), W = P.map(pack);
  const chosen = new Uint8Array(P.length);
  const first = nearestIndex(W, pack(majority(P)));
  const picks = [first];
  chosen[first] = 1;
  const minD = W.map((w) => hammingW(w, W[first]));
  while (picks.length < want) {
    let best = -1, bd = -1;
    for (let i = 0; i !== P.length; i++) if (!chosen[i] && minD[i] > bd) { bd = minD[i]; best = i; }
    picks.push(best);
    chosen[best] = 1;
    for (let i = 0; i !== P.length; i++) minD[i] = Math.min(minD[i], hammingW(W[i], W[best]));
  }
  let mems = picks.map((i) => Uint8Array.from(P[i]));
  const assign = new Int32Array(P.length).fill(-1);
  for (let round = 0; round !== MAX_ROUNDS; round++) {
    const MW = mems.map(pack);
    let changed = false;
    for (let i = 0; i !== P.length; i++) { const j = nearestIndex(MW, W[i]); if (assign[i] !== j) { assign[i] = j; changed = true; } }
    if (!changed) break;
    mems = mems.map((m, j) => { const members = P.filter((_, i) => assign[i] === j); return members.length ? majority(members, m) : m; });
  }
  return mems;
}

/** grow(x, y, { b, k }) → the shape: k memories per class, in class order, grown from the digits given; or null. */
export function grow(x, y, { b, k } = {}) {
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return null;   // a bad b or k grows nothing: null below
  const mem = [], cls = [];
  for (let c = 0; c !== CLASSES; c++) {
    const P = [];
    for (let i = 0; i !== x.length; i++) if (y[i] === c) { const e = encode(x[i], b); if (e) P.push(e); }
    for (const m of growClass(P, k)) { mem.push(m); cls.push(c); }
  }
  return mem.length ? { b, k, N: PIXELS * b, mem, cls } : null;
}

const HEX = '0123456789abcdef';
/** hexOf(bits) → the bits as hex, four bits to a digit, first bit highest. */
export function hexOf(bits) {
  let s = '';
  for (let i = 0; i !== bits.length; i += 4) s += HEX[(bits[i] << 3) | ((bits[i + 1] | 0) << 2) | ((bits[i + 2] | 0) << 1) | (bits[i + 3] | 0)];
  return s;
}
/** bitsOf(hex, N) → N bits back from hexOf, or null. */
export function bitsOf(hex, N) {
  if (typeof hex !== 'string' || hex.length * 4 !== N || !/^[0-9a-f]*$/.test(hex)) return null;
  const out = new Uint8Array(N);
  for (let h = 0; h !== hex.length; h++) { const v = HEX.indexOf(hex[h]); for (let j = 0; j !== 4; j++) out[h * 4 + j] = (v >> (3 - j)) & 1; }
  return out;
}

/** shapeText(shape) → the canonical text of a shape (what seal 2 hashes). */
export function shapeText(s) {
  return ['settling-cell.shape.v1 b=' + s.b + ' k=' + s.k + ' N=' + s.N + ' M=' + s.mem.length, ...s.mem.map((m, i) => s.cls[i] + ' ' + hexOf(m))].join('\n') + '\n';
}
/** parseShape(text) → the shape back, or null if the text is not a well-formed shape. */
export function parseShape(text) {
  const lines = String(text ?? '').split('\n').filter((l) => l.length);
  const h = /^settling-cell\.shape\.v1 b=(\d+) k=(\d+) N=(\d+) M=(\d+)$/.exec(lines[0] || '');
  if (!h) return null;
  const [b, k, N, M] = h.slice(1).map(Number);
  if (!THRESHOLDS[b] || N !== PIXELS * b || lines.length !== M + 1 || M < 1) return null;
  const mem = [], cls = [];
  for (const l of lines.slice(1)) {
    const m = /^(\d) ([0-9a-f]+)$/.exec(l);
    const bits = m && bitsOf(m[2], N);
    if (!bits) return null;
    mem.push(bits);
    cls.push(Number(m[1]));
  }
  return { b, k, N, mem, cls };
}

/** cellText(shape, R, n) → the canonical text of a whole cell, settings first: the bytes seal 2 hashes. */
export function cellText(shape, R, n) {
  return 'settling-cell.cell.v1 R=' + R + ' n=' + n + '\n' + shapeText(shape);
}
/** parseCell(text) → { shape, R, n } back from cellText, or null. */
export function parseCell(text) {
  const [head, ...rest] = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  const h = /^settling-cell\.cell\.v1 R=(\d+) n=(\d+)$/.exec(head);
  const shape = h && parseShape(rest.join('\n'));
  return shape ? { shape, R: Number(h[1]), n: Number(h[2]) } : null;
}

/** cell(shape, { R, n }) → a ready cell, or null when the settings are out of range or the energy could leave the
 *  range where whole numbers are exact (M · R^n must stay below 2^53). */
export function cell(shape, { R, n } = {}) {
  if (!shape || !Array.isArray(shape.mem) || !shape.mem.length || !shape.mem.every(isBits)) return null;
  const N = shape.N, M = shape.mem.length;
  const K = kernel(N, R, n);
  if (!K || !shape.mem.every((m) => m.length === N) || M * K[0] >= 2 ** 53) return null;
  const memT = new Uint8Array(N * M);
  for (let m = 0; m !== M; m++) for (let i = 0; i !== N; i++) memT[i * M + m] = shape.mem[m][i];
  return { shape, N, M, R, n, K, memT, cls: Int8Array.from(shape.cls) };
}

/** distances(c, bits) → the Hamming distance from bits to every memory. */
export function distances(c, bits) {
  const { N, M, memT } = c, d = new Int32Array(M);
  for (let i = 0; i !== N; i++) { const b = bits[i], base = i * M; for (let m = 0; m !== M; m++) d[m] += b ^ memT[base + m]; }
  return d;
}

/** energyOf(c, d) → the fit, −E: Σ K[d] over the memories (whole number). */
export function energyOf(c, d) {
  let f = 0;
  for (let m = 0; m !== c.M; m++) f += c.K[d[m]];
  return f;
}

/** classFit(c, d) → each class's share of the fit. */
export function classFit(c, d) {
  const f = new Array(CLASSES).fill(0);
  for (let m = 0; m !== c.M; m++) f[c.cls[m]] += c.K[d[m]];
  return f;
}

/** answerOf(fits) → the class holding the most fit (the lowest class on a tie), or −1 when the fit is zero. */
export function answerOf(fits) {
  let best = -1, bf = 0;
  for (let k = 0; k !== fits.length; k++) if (fits[k] > bf) { bf = fits[k]; best = k; }
  return best;
}

/** readout(c, bits) → the one-step answer: the same rule on the unsettled bits. */
export function readout(c, bits) {
  const d = distances(c, bits);
  return { answer: answerOf(classFit(c, d)), fit: energyOf(c, d) };
}

/** settle(c, bits, { trace, maxSweeps }) → sweep the bits in order, flip a bit only when it strictly lowers the energy,
 *  stop after a sweep with no flip. Returns the settled bits, the fit before and after, the flips, the sweeps run
 *  (the last one is the sweep that found nothing to flip), whether it reached a fixed point, and the answer. */
export function settle(c, bits, { trace = false, maxSweeps = MAX_SWEEPS } = {}) {
  if (!c || !bits || bits.length !== c.N) return null;
  const { N, M, K, memT } = c;
  const s = Uint8Array.from(bits), d = distances(c, s);
  const start = energyOf(c, d);
  let fit = start, flips = 0, sweeps = 0, moved = true;
  const path = trace ? [] : null;
  while (moved && sweeps < maxSweeps) {
    moved = false;
    sweeps++;
    for (let i = 0; i !== N; i++) {
      const si = s[i], base = i * M;
      let gain = 0;
      for (let m = 0; m !== M; m++) { const dm = d[m]; gain += K[memT[base + m] === si ? dm + 1 : dm - 1] - K[dm]; }
      if (gain > 0) {
        s[i] = si ^ 1;
        for (let m = 0; m !== M; m++) d[m] += memT[base + m] === si ? 1 : -1;
        fit += gain;
        flips++;
        moved = true;
        if (path) path.push(i);
      }
    }
  }
  return { state: s, start, fit, flips, sweeps, settled: !moved, answer: answerOf(classFit(c, d)), d, path };
}

/** noisy(pixels, count, seed) → a copy with `count` pixels (distinct positions) replaced by whole numbers 0..16. */
export function noisy(pixels, count, seed) {
  const out = pixels.slice(), idx = Array.from({ length: PIXELS }, (_, i) => i), r = rng(seed);
  const n = Math.max(0, Math.min(PIXELS, count | 0));
  for (let t = 0; t !== n; t++) {
    const j = t + Math.floor(r() * (PIXELS - t));
    const tmp = idx[t]; idx[t] = idx[j]; idx[j] = tmp;
    out[idx[t]] = Math.floor(r() * (MAXV + 1));
  }
  return out;
}

/** scrambled(pixels, seed) → the same 64 values in a shuffled order (Fisher–Yates): the same ink, the wrong shape. */
export function scrambled(pixels, seed) {
  const out = pixels.slice(), r = rng(seed);
  for (let i = PIXELS - 1; i !== 0; i--) { const j = Math.floor(r() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
  return out;
}

/** pairedLow(a, b, n, seed) → the 2.5th percentile of mean(a − b) over paired bootstrap resamples (a, b: 0/1 rows). */
export function pairedLow(a, b, n = 2000, seed = 99) {
  const L = a.length;
  if (!L || b.length !== L) return NaN;
  const r = rng(seed), diffs = new Float64Array(n);
  for (let k = 0; k !== n; k++) {
    let s = 0;
    for (let t = 0; t !== L; t++) { const i = Math.floor(r() * L); s += a[i] - b[i]; }
    diffs[k] = s / L;
  }
  diffs.sort();
  return diffs[Math.floor(0.025 * n)];
}

export default { PIXELS, CLASSES, MAXV, MAX_ROUNDS, MAX_SWEEPS, THRESHOLDS, parse, encode, inkOf, hamming, pack, popcount, hammingW, kernel, majority, nearestIndex, growClass, grow, hexOf, bitsOf, shapeText, parseShape, cellText, parseCell, cell, distances, energyOf, classFit, answerOf, readout, settle, noisy, scrambled, pairedLow };
