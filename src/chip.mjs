// src/chip.mjs — chip-sim: the defence layer written to microcontroller rules, run in an EMULATOR (no device in hand).
// All of the layer's data lives in one fixed arena allocated at boot; the defence path uses whole numbers only (bits
// packed into 32-bit words, popcount distances, an integer energy table); nothing grows after boot; every loop is bounded.
// A read-only copy of the shape ("flash") lets a corrupted layer recover. The floor is Ed25519 over the raw bytes.
// Sealed first: CLAIMS.md (seal 1, f85606c).
import * as K from '../vendor/living-seed/vendor/keys/keys.mjs';

export const ARENA = 32768, N = 256, W = 8, B = 4, AB_MAX = 16, REG = 32, RING = 32, SWEEPS = 64;
const T = [2, 6, 10, 14];

/** popcount(v) → the on-bits of a 32-bit word. */
export function popcount(v) { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24; }
/** crc32(u8) → the standard CRC-32 of the bytes (whole numbers only). */
export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i !== u8.length; i++) { c ^= u8[i]; for (let k = 0; k !== 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
/** layout(M) → byte offsets of every region in the arena, widest alignment first, and the total used. */
export function layout(M) {
  const L = {}; let o = 0;
  const put = (name, bytes, align) => { o = Math.ceil(o / align) * align; L[name] = [o, bytes]; o += bytes; };
  put('K', (N + 1) * 8, 8); put('P', M * W * 4, 4); put('AB', AB_MAX * W * 4, 4); put('S', W * 4, 4); put('SCR', W * 4, 4); put('CRC', 4, 4);
  put('D', (M + AB_MAX) * 2, 2); put('CLS', M, 1); put('ABN', 1, 1); put('REG', REG * 64, 1); put('RING', RING * 64, 1); put('RINGN', 2, 1);
  return { regions: L, used: o };
}

/** parseCellText(text) → { R, n, M, cls, words } from a settling-cell text, or null. Patterns are packed as the chip holds them. */
export function parseCellText(text) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n').filter((l) => l.length);
  const h = /^settling-cell\.cell\.v1 R=(\d+) n=(\d+)$/.exec(lines[0] || ''), s = /^settling-cell\.shape\.v1 b=4 k=\d+ N=256 M=(\d+)$/.exec(lines[1] || '');
  if (!h || !s || lines.length !== Number(s[1]) + 2) return null;
  const M = Number(s[1]), cls = [], words = new Uint32Array(M * W);
  for (let m = 0; m !== M; m++) {
    const x = /^(\d) ([0-9a-f]{64})$/.exec(lines[m + 2]);
    if (!x) return null;
    cls.push(Number(x[1]));
    for (let i = 0; i !== N; i++) if ((parseInt(x[2][i >> 2], 16) >> (3 - (i & 3))) & 1) words[m * W + (i >>> 5)] |= 1 << (i & 31);
  }
  return { R: Number(h[1]), n: Number(h[2]), M, cls, words };
}

/** boot(nodeText, abText, regression, arena) → a chip: one arena of `arena` bytes (the device budget, 32,768 unless a
 *  test asks), its views, the flash copy, and its checksum; or null when it does not fit. */
export function boot(nodeText, abText, regression, arena = ARENA) {
  const node = parseCellText(nodeText), ab = parseCellText(abText);
  if (!node || !ab || ab.M > AB_MAX || ab.R !== node.R || ab.n !== node.n) return null;
  const lay = layout(node.M);
  if (lay.used > arena) return null;
  const buf = new ArrayBuffer(arena), v = (Type, name) => new Type(buf, lay.regions[name][0], lay.regions[name][1] / Type.BYTES_PER_ELEMENT);
  const c = { M: node.M, R: node.R, n: node.n, lay, buf, u8: new Uint8Array(buf), K: v(Float64Array, 'K'), P: v(Uint32Array, 'P'), AB: v(Uint32Array, 'AB'), S: v(Uint32Array, 'S'), SCR: v(Uint32Array, 'SCR'), CRC: v(Uint32Array, 'CRC'),
    D: v(Uint16Array, 'D'), CLS: v(Uint8Array, 'CLS'), ABN: v(Uint8Array, 'ABN'), REGB: v(Uint8Array, 'REG'), RINGB: v(Uint8Array, 'RING'), RINGN: v(Uint8Array, 'RINGN'), up: true, ops: 0 };
  for (let d = 0; d !== node.R; d++) { let x = 1; for (let t = 0; t !== node.n; t++) x *= node.R - d; c.K[d] = x; }
  c.P.set(node.words); c.CLS.set(node.cls); c.AB.set(ab.words); c.ABN[0] = ab.M;
  for (let r = 0; r !== Math.min(REG, regression.length); r++) c.REGB.set(regression[r], r * 64);
  c.CRC[0] = checksum(c);
  c.flash = Uint8Array.from(c.u8);
  return c;
}
const span = (c, name) => c.u8.subarray(c.lay.regions[name][0], c.lay.regions[name][0] + c.lay.regions[name][1]);
/** checksum(c) → the CRC-32 over the shape, antibody, count, class and energy regions. */
export const checksum = (c) => crc32(Uint8Array.from([...span(c, 'K'), ...span(c, 'P'), ...span(c, 'AB'), ...span(c, 'ABN'), ...span(c, 'CLS')]));

/** restore(c) → reload the checked regions (and the checksum) from the read-only copy; the ring and regression set stay. */
export function restore(c) { for (const name of ['K', 'P', 'AB', 'ABN', 'CLS', 'CRC']) { const [o, len] = c.lay.regions[name]; c.u8.set(c.flash.subarray(o, o + len), o); } }

/** load(c, ink) → the thermometer bits of 64 ink values into the state words S. */
export function load(c, ink) {
  c.S.fill(0);
  for (let p = 0; p !== 64; p++) for (let j = 0; j !== B; j++) if (ink[p] >= T[j]) { const i = p * B + j; c.S[i >>> 5] |= 1 << (i & 31); }
}
const bit = (words, base, i) => (words[base + (i >>> 5)] >>> (i & 31)) & 1;
/** settle(c) → Rung 1's settle on the packed state: flip a bit only when the energy strictly drops, stop on a quiet sweep.
 *  Returns the answer, the fit, flips and sweeps, and the antibodies' fit at the settled state. */
export function settle(c) {
  const { M, K, P, S, D, CLS, AB } = c;
  for (let m = 0; m !== M; m++) { let d = 0; for (let w = 0; w !== W; w++) d += popcount(S[w] ^ P[m * W + w]); D[m] = d; }
  let fit = 0, flips = 0, sweeps = 0, moved = true;
  for (let m = 0; m !== M; m++) fit += K[D[m]];
  while (moved && sweeps !== SWEEPS) {
    moved = false; sweeps++;
    for (let i = 0; i !== N; i++) {
      const si = (S[i >>> 5] >>> (i & 31)) & 1;
      let gain = 0;
      for (let m = 0; m !== M; m++) { const dm = D[m]; gain += K[bit(P, m * W, i) === si ? dm + 1 : dm - 1] - K[dm]; }
      c.ops += M;
      if (gain > 0) { S[i >>> 5] ^= 1 << (i & 31); for (let m = 0; m !== M; m++) D[m] += bit(P, m * W, i) === si ? 1 : -1; fit += gain; flips++; moved = true; }
    }
  }
  const fits = new Array(10).fill(0);
  for (let m = 0; m !== M; m++) fits[CLS[m]] += K[D[m]];
  let answer = -1, best = 0;
  for (let k = 0; k !== 10; k++) if (fits[k] > best) { best = fits[k]; answer = k; }
  let abFit = 0;
  for (let a = 0; a !== c.ABN[0]; a++) { let d = 0; for (let w = 0; w !== W; w++) d += popcount(S[w] ^ AB[a * W + w]); abFit += K[d]; }
  return { answer, fit, flips, sweeps, abFit };
}
/** verdictOf(r) → Rung 5's verdict: zero fit is non-fit; antibodies holding at least the node's fit claim it; else pass. */
export const verdictOf = (r) => (r.fit === 0 ? 'non-fit' : r.abFit >= r.fit ? 'antibody' : 'pass');
/** judge(c, ink) → settle the ink and give the verdict. */
export function judge(c, ink) { load(c, ink); const r = settle(c); return { ...r, verdict: verdictOf(r) }; }

/** screen(c, msg, roster) → the whole layer on one message: the floor, then the integrity check, then the fit-check.
 *  A failed checksum takes the layer down for this input (delivered unscreened) and reloads the flash copy. */
export async function screen(c, msg, roster) {
  if (!roster.includes(msg.pub)) return { delivered: false, verdict: 'unknown-key' };
  if (!(await K.verify(msg.pub, msg.sig, msg.bytes))) return { delivered: false, verdict: 'bad-signature' };
  if (msg.bytes.length !== 64 || msg.bytes.some((x) => x > 16)) return { delivered: false, verdict: 'malformed' };
  if (checksum(c) !== c.CRC[0]) { c.up = false; restore(c); c.up = checksum(c) === c.CRC[0]; return { delivered: true, verdict: 'unscreened', layer: 'down' }; }
  const r = judge(c, msg.bytes);
  return { delivered: r.verdict === 'pass', verdict: r.verdict, answer: r.answer, fit: r.fit, layer: 'up' };
}

/** confirm(c, ink) → the device's application confirms an input as an attack: it joins the ring of the last 32. Confirm
 *  number k writes slot k mod 32; the counter wraps from 64 back to 32, so it never overflows and stays full once full. */
export function confirm(c, ink) { const n = c.RINGN[0]; c.RINGB.set(ink, (n % RING) * 64); c.RINGN[0] = n + 1 === 2 * RING ? RING : n + 1; }
const ringCount = (c) => Math.min(RING, c.RINGN[0]);
const ringInk = (c, k) => c.RINGB.subarray(k * 64, k * 64 + 64);
const regInk = (c, k) => c.REGB.subarray(k * 64, k * 64 + 64);
/** tally(c) → how many ring attacks the layer rejects, and how many regression digits it rejects. */
export function tally(c) {
  let atk = 0, reg = 0;
  for (let k = 0; k !== ringCount(c); k++) atk += judge(c, ringInk(c, k)).verdict === 'pass' ? 0 : 1;
  for (let k = 0; k !== REG; k++) reg += judge(c, regInk(c, k)).verdict === 'pass' ? 0 : 1;
  return { atk, reg };
}
/** evolveStep(c, step, rng) → one model-free improvement: put the settled state of a confirmed attack into an antibody
 *  slot (a new slot while there is room, else a random one); keep it only if it newly rejects a confirmed attack and
 *  rejects no regression digit. */
export function evolveStep(c, step, rng) {
  const n = ringCount(c);
  if (n === 0) return { kept: false, why: 'nothing confirmed' };
  const r = rng(7700 + step), k = Math.floor(r() * n), slot = c.ABN[0] !== AB_MAX ? c.ABN[0] : Math.floor(r() * AB_MAX);
  const before = tally(c);
  load(c, ringInk(c, k)); settle(c); c.SCR.set(c.S);
  const old = c.AB.slice(slot * W, slot * W + W), oldN = c.ABN[0];
  c.AB.set(c.SCR, slot * W); if (slot === oldN) c.ABN[0] = oldN + 1;
  const after = tally(c);
  if (after.atk > before.atk && after.reg === 0) { c.CRC[0] = checksum(c); c.flash.set(c.u8); return { kept: true, slot, atk: after.atk }; }
  c.AB.set(old, slot * W); c.ABN[0] = oldN;
  return { kept: false, slot, atk: before.atk };
}

/** antibodyBytes(c) → the antibody region and its count, as the bytes a share signs. */
export const antibodyBytes = (c) => Uint8Array.from([c.ABN[0], ...span(c, 'AB')]);
/** adopt(c, msg, roster) → another chip's antibody share: the floor first, then this chip's own regression check. */
export async function adopt(c, msg, roster) {
  if (!roster.includes(msg.pub)) return { adopted: false, reason: 'unknown-key' };
  if (!(await K.verify(msg.pub, msg.sig, msg.bytes))) return { adopted: false, reason: 'bad-signature' };
  if (msg.bytes.length !== 1 + AB_MAX * W * 4 || msg.bytes[0] > AB_MAX) return { adopted: false, reason: 'malformed' };
  const keep = Uint8Array.from(antibodyBytes(c)), regBefore = tally(c).reg;
  c.ABN[0] = msg.bytes[0]; span(c, 'AB').set(msg.bytes.subarray(1));
  const regAfter = tally(c).reg;
  if (regAfter > regBefore) { c.ABN[0] = keep[0]; span(c, 'AB').set(keep.subarray(1)); return { adopted: false, reason: 'harms-regression' }; }
  c.CRC[0] = checksum(c); c.flash.set(c.u8);
  return { adopted: true, reason: 'adopted' };
}
/** inject(c, region, byte, mask) → a fault: flip bits of one arena byte without touching the checksum. */
export function inject(c, region, byte, mask) { const [o, len] = c.lay.regions[region]; c.u8[o + (byte % len)] ^= mask; }

export default { ARENA, N, W, B, AB_MAX, REG, RING, SWEEPS, popcount, crc32, layout, parseCellText, boot, checksum, restore, load, settle, verdictOf, judge, screen, confirm, tally, evolveStep, antibodyBytes, adopt, inject };
