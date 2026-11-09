// chip-sim, held to the sealed text: the arena, the integer settle (identical to Rung 1's kernel), the floor, integrity
// and recovery, the ring, evolution, sharing, and fault injection. Fixtures come from the MNIST TRAINING file only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import H from '../src/chip.mjs';
import R from '../src/run.mjs';
import C from '../vendor/settling-cell/src/cell.mjs';
import M from '../vendor/hybrid-gate/src/mnist.mjs';
import * as K from '../vendor/living-seed/vendor/keys/keys.mjs';
import { rng } from '../vendor/settling-cell/vendor/seed-library/seedlib.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const claims = read('CLAIMS.md').replace(/\s+/g, ' ');
const raw = (f) => new Uint8Array(gunzipSync(readFileSync(new URL('../data/mnist/' + f, import.meta.url))));
const IMG = raw('train-images-idx3-ubyte.gz'), LAB = raw('train-labels-idx1-ubyte.gz');
const sub = (from, n) => {
  const i = new Uint8Array(16 + n * 784); i.set(IMG.subarray(0, 16)); new DataView(i.buffer).setUint32(4, n); i.set(IMG.subarray(16 + from * 784, 16 + (from + n) * 784), 16);
  const l = new Uint8Array(8 + n); l.set(LAB.subarray(0, 8)); new DataView(l.buffer).setUint32(4, n); l.set(LAB.subarray(8 + from, 8 + from + n), 8);
  return M.parse(i, l);
};
const nodeText = read('vendor/mesh-share/data/cell-after.txt'), abText = read('vendor/geometric-defence/data/antibodies.txt');
const tr = sub(52000, 700), reg = tr.x.slice(200, 232);
const f = C.parseCell(nodeText), ref = C.cell(f.shape, { R: f.R, n: f.n });
const head = nodeText.split('\n')[0], emptyAb = head + '\nsettling-cell.shape.v1 b=4 k=0 N=256 M=0\n';
const hexOfWords = (S) => { let h = ''; for (let i = 0; i !== 256; i += 4) { let v = 0; for (let j = 0; j !== 4; j++) v = (v << 1) | ((S[(i + j) >>> 5] >>> ((i + j) & 31)) & 1); h += v.toString(16); } return h; };

test('the sealed numbers in the code are the ones CLAIMS.md states', () => {
  for (const s of ['at most **32,768 bytes**', 'regression set of 32 genuine digits (MNIST training rows 52,200–52,231)', 'last 32 inputs', 'one antibody slot (of 16)', 'seeded 7700 + the step. 200 steps', 'rows 52,300–52,599), seeds 80,000 + i', 'seeds 90,000 + i', '200 injected faults', 'seed 7900 + i', '240 MHz microcontroller at 4 cycles per operation', '**Not tested in this build: no Pi in hand.**'])
    assert.ok(claims.includes(s), 'CLAIMS.md says: ' + s);
  assert.deepEqual([H.ARENA, H.N, H.W, H.B, H.AB_MAX, H.REG, H.RING, H.SWEEPS], [32768, 256, 8, 4, 16, 32, 32, 64]);
  assert.deepEqual(R.ROWS, { reg: [52200, 52232], learn: [52300, 52600] });
  assert.deepEqual(R.SEEDS, { learn: 80000, held: 90000, faults: 7900 });
  assert.deepEqual([R.PER, R.FAULTS, R.MHZ, R.CYCLES_PER_OP], [300, 200, 240, 4]);
});

test('popcount, CRC-32 and the arena layout', () => {
  assert.deepEqual([0, 1, 0xffffffff, 0x80000000, 0x12345678].map(H.popcount), [0, 1, 32, 1, 13]);
  assert.equal(H.crc32(new TextEncoder().encode('123456789')), 0xcbf43926, 'the standard check value');
  assert.equal(H.crc32(new Uint8Array(0)), 0);
  const L = H.layout(200);
  assert.deepEqual(L.regions.K, [0, 257 * 8]);
  for (const [name, align] of [['K', 8], ['P', 4], ['AB', 4], ['S', 4], ['SCR', 4], ['CRC', 4], ['D', 2]]) assert.equal(L.regions[name][0] % align, 0, name + ' aligned');
  assert.deepEqual(L.regions.P[1], 200 * 8 * 4);
  assert.deepEqual(L.regions.D[1], 216 * 2);
  assert.equal(L.used, L.regions.RINGN[0] + 2);
  assert.ok(L.used <= 32768);
  const names = Object.keys(L.regions);
  for (let i = 1; i !== names.length; i++) assert.ok(L.regions[names[i]][0] >= L.regions[names[i - 1]][0] + L.regions[names[i - 1]][1], 'no overlap at ' + names[i]);
});

test('parse and boot: one arena, a flash copy, a checksum; garbage refused', () => {
  const p = H.parseCellText(nodeText);
  assert.deepEqual([p.R, p.n, p.M, p.cls.length, p.words.length], [76, 7, 200, 200, 1600]);
  assert.equal(H.parseCellText('nope'), null);
  assert.equal(H.parseCellText(nodeText.replace('b=4', 'b=2')), null);
  assert.equal(H.parseCellText(nodeText.split('\n').slice(0, 5).join('\n')), null, 'too few lines');
  assert.equal(H.parseCellText(nodeText.replace(/\n(\d) ([0-9a-f]{64})/, '\n$1 zz$2'.slice(0, 6))), null);
  const c = H.boot(nodeText, abText, reg);
  assert.equal(c.buf.byteLength, 32768);
  assert.deepEqual([c.M, c.R, c.n, c.ABN[0]], [200, 76, 7, 10]);
  assert.equal(c.K[0], 76 ** 7); assert.equal(c.K[75], 1); assert.equal(c.K[76], 0);
  assert.equal(c.CRC[0], H.checksum(c));
  assert.deepEqual(Array.from(c.flash), Array.from(c.u8));
  assert.deepEqual(Array.from(c.REGB.subarray(64, 128)), reg[1]);
  assert.equal(H.boot('nope', abText, reg), null);
  assert.equal(H.boot(nodeText, 'nope', reg), null);
  assert.equal(H.boot(nodeText, abText.replace('R=76', 'R=72'), reg), null, 'antibodies must share the node\'s energy');
  assert.equal(H.boot(nodeText, abText.replace('n=7', 'n=6'), reg), null);
  const many = head + '\nsettling-cell.shape.v1 b=4 k=17 N=256 M=17\n' + Array.from({ length: 17 }, () => '0 ' + '0'.repeat(64)).join('\n') + '\n';
  assert.equal(H.boot(nodeText, many, reg), null, 'at most 16 antibody slots');
  assert.ok(H.boot(nodeText, emptyAb, reg), 'no antibodies is allowed');
});

test('CI-EQ on a fixture: the packed integer settle is Rung 1\'s settle, bit for bit', () => {
  const c = H.boot(nodeText, abText, reg);
  for (const x of tr.x.slice(300, 340)) {
    const a = H.judge(c, x), b = C.settle(ref, C.encode(x, 4));
    assert.deepEqual([a.answer, a.fit, a.flips, a.sweeps], [b.answer, b.fit, b.flips, b.sweeps]);
    const bits = Array.from({ length: 256 }, (_, i) => (c.S[i >>> 5] >>> (i & 31)) & 1);
    assert.deepEqual(bits, Array.from(b.state));
  }
  H.load(c, new Array(64).fill(6));
  assert.deepEqual(Array.from(c.S), Array.from({ length: 8 }, () => 0x33333333), 'ink 6 is thermometer 1100 in every pixel');
  assert.equal(H.verdictOf({ fit: 0, abFit: 0 }), 'non-fit');
  assert.equal(H.verdictOf({ fit: 5, abFit: 5 }), 'antibody');
  assert.equal(H.verdictOf({ fit: 5, abFit: 4 }), 'pass');
});

test('screen: the floor first, then the checksum, then the fit-check; a corrupted layer goes down and recovers', async () => {
  const app = await R.keyOf('app'), other = await R.keyOf('other'), roster = [app.pub], c = H.boot(nodeText, abText, reg);
  const msg = async (key, ink) => ({ bytes: Uint8Array.from(ink), sig: await K.sign(key, Uint8Array.from(ink)), pub: key.pub });
  const g = tr.x[300], ok = await H.screen(c, await msg(app, g), roster);
  assert.equal(ok.layer, 'up');
  assert.equal(ok.delivered, ok.verdict === 'pass');
  assert.deepEqual(await H.screen(c, await msg(other, g), roster), { delivered: false, verdict: 'unknown-key' });
  const m = await msg(app, g), bent = m.bytes.slice(); bent[2] ^= 1;
  assert.deepEqual(await H.screen(c, { ...m, bytes: bent }, roster), { delivered: false, verdict: 'bad-signature' });
  const hot = new Array(64).fill(0); hot[9] = 17;
  assert.deepEqual(await H.screen(c, await msg(app, hot), roster), { delivered: false, verdict: 'malformed' });
  assert.deepEqual(await H.screen(c, await msg(app, g.slice(0, 63)), roster), { delivered: false, verdict: 'malformed' });
  for (const region of ['P', 'AB', 'K', 'CLS', 'ABN']) {
    const d = H.boot(nodeText, abText, reg);
    H.inject(d, region, 3, 0x40);
    const s = await H.screen(d, await msg(app, g), roster);
    assert.deepEqual(s, { delivered: true, verdict: 'unscreened', layer: 'down' }, region + ' corruption caught');
    assert.equal(d.up, true, 'the flash copy checks, so the layer is back up');
    assert.equal((await H.screen(d, await msg(app, g), roster)).layer, 'up');
    assert.equal((await H.screen(d, { ...m, bytes: bent }, roster)).delivered, false, 'the floor holds while recovering');
  }
  const e = H.boot(nodeText, abText, reg); H.inject(e, 'P', 7, 1); e.flash[e.lay.regions.P[0] + 7] ^= 1;
  await H.screen(e, await msg(app, g), roster);
  assert.equal(e.up, false, 'a corrupted flash copy leaves the layer down');
});

test('the ring, the tally, and model-free evolution: kept only when it newly rejects and spares the regression set', () => {
  const c = H.boot(nodeText, emptyAb, reg);
  assert.deepEqual(H.evolveStep(c, 0, rng), { kept: false, why: 'nothing confirmed' });
  for (let k = 0; k !== 40; k++) H.confirm(c, tr.x[k]);
  assert.equal(Math.min(32, c.RINGN[0]), 32);
  assert.deepEqual(Array.from(c.RINGB.subarray(7 * 64, 8 * 64)), tr.x[39], 'the 40th confirm wrote slot 7');
  const c2 = H.boot(nodeText, emptyAb, reg); for (let k = 0; k !== 300; k++) H.confirm(c2, tr.x[k % 50]);
  assert.ok(c2.RINGN[0] >= 32 && c2.RINGN[0] <= 255, 'the count saturates without overflow');
  const passing = tr.x.slice(400, 700).filter((x) => H.judge(c, x).verdict === 'pass');
  const regOk = passing.slice(0, 32), d = H.boot(nodeText, emptyAb, regOk);
  assert.deepEqual(H.tally(d), { atk: 0, reg: 0 });
  let x = null;
  for (let s = 0; s !== 60 && !x; s++) { const cand = C.scrambled(tr.x[s], 80000 + s); if (H.judge(d, cand).verdict === 'pass') x = cand; }
  assert.ok(x, 'a scrambled digit that passes');
  H.load(d, x); H.settle(d);
  const one = head + '\nsettling-cell.shape.v1 b=4 k=1 N=256 M=1\n0 ' + hexOfWords(d.S) + '\n';
  const e = H.boot(nodeText, one, regOk);
  assert.equal(H.judge(e, x).verdict, 'pass', 'one antibody at the attack\'s settled state cannot out-fit the node');
  H.confirm(e, x);
  const step = H.evolveStep(e, 0, rng);
  assert.equal(step.kept, H.judge(e, x).verdict !== 'pass');
  if (step.kept) { assert.equal(e.ABN[0], 2); assert.equal(e.CRC[0], H.checksum(e)); assert.deepEqual(Array.from(e.flash), Array.from(e.u8)); }
  const harm = H.boot(nodeText, one, [...regOk.slice(0, 31), x]);
  H.confirm(harm, x);
  const before = Array.from(H.antibodyBytes(harm)), st = H.evolveStep(harm, 0, rng);
  assert.equal(st.kept, false, 'a change that would reject a regression digit is never kept');
  assert.deepEqual(Array.from(H.antibodyBytes(harm)), before, 'and is undone');
});

test('sharing antibodies: the floor, then the receiver\'s own regression check', async () => {
  const devA = await R.keyOf('device-A'), b = H.boot(nodeText, abText, reg), roster = [devA.pub];
  const bytes = H.antibodyBytes(b), sig = await K.sign(devA, bytes), share = { bytes, sig, pub: devA.pub };
  assert.equal(bytes.length, 1 + 16 * 8 * 4);
  assert.equal(bytes[0], 10);
  assert.deepEqual(await H.adopt(b, { ...share, pub: (await R.keyOf('x')).pub }, roster), { adopted: false, reason: 'unknown-key' });
  const bent = bytes.slice(); bent[9] ^= 1;
  assert.deepEqual(await H.adopt(b, { ...share, bytes: bent }, roster), { adopted: false, reason: 'bad-signature' });
  const short = bytes.slice(0, 100);
  assert.deepEqual(await H.adopt(b, { bytes: short, sig: await K.sign(devA, short), pub: devA.pub }, roster), { adopted: false, reason: 'malformed' });
  const over = bytes.slice(); over[0] = 17;
  assert.deepEqual(await H.adopt(b, { bytes: over, sig: await K.sign(devA, over), pub: devA.pub }, roster), { adopted: false, reason: 'malformed' });
  assert.deepEqual(await H.adopt(b, share, roster), { adopted: true, reason: 'adopted' });
  assert.equal(b.CRC[0], H.checksum(b));
  const g = H.boot(nodeText, emptyAb, reg); H.load(g, reg[0]); H.settle(g);
  const killer = H.boot(nodeText, head + '\nsettling-cell.shape.v1 b=4 k=3 N=256 M=3\n' + [0, 0, 0].map(() => '0 ' + hexOfWords(g.S)).join('\n') + '\n', reg);
  const kb = H.antibodyBytes(killer), keep = Array.from(H.antibodyBytes(b));
  const res = await H.adopt(b, { bytes: kb, sig: await K.sign(devA, kb), pub: devA.pub }, roster);
  assert.deepEqual(res, { adopted: false, reason: 'harms-regression' }, 'antibodies that would reject a regression digit are refused');
  assert.deepEqual(Array.from(H.antibodyBytes(b)), keep, 'and leave the receiver unchanged');
});

test('learn and evaluate on a small fixture: every claim\'s machinery, end to end', async () => {
  const train = { x: Array.from({ length: 52600 }, (_, i) => tr.x[i % 700]), y: Array.from({ length: 52600 }, (_, i) => tr.y[i % 700]) };
  const small = { x: tr.x.slice(500, 540), y: tr.y.slice(500, 540) };
  const L = await R.learn({ train, nodeText, abText }, 20);
  assert.equal(L.arena <= 32768, true);
  assert.equal(L.honest.reason, 'adopted');
  assert.equal(L.forged.reason, 'bad-signature');
  assert.equal(L.forgedUnchanged, true);
  assert.equal(L.steps.length, 20);
  assert.equal(L.passed, [...L.steps].filter((c) => c !== '0').length);
  assert.equal(L.kept, [...L.steps].filter((c) => c === '2').length);
  assert.equal(await R.learn({ train, nodeText: 'nope', abText }, 20), null);
  const c = R.chipWith(nodeText, abText, reg, L.aBytes);
  assert.deepEqual(Array.from(H.antibodyBytes(c)), L.aBytes);
  assert.equal(c.CRC[0], H.checksum(c));
});

test('verdicts: every bar on whole counts, and CI1 never claimed', () => {
  const base = { per: 100, digits: 100, ci1: 'pending hardware: no Pi in hand', arena: 13767, arenaMax: 32768, genuinePass: 97, noise: 99, inverted: 99, errors: 0, mismatches: 0, lowCI5: 0.01, regressionPasses: true,
    scrambled: { before: 40, after: 50, deviceB: 50 }, faults: { injected: 200, caught: 200, floorHeld: 200, backUp: 200 }, learned: { honest: 'adopted', forged: 'bad-signature', forgedUnchanged: true } };
  const pass = (o) => Object.fromEntries(R.verdicts({ ...base, ...o }).map((v) => [v.id, v.pass]));
  assert.deepEqual(pass({}), { CI1: false, 'CI-EQ': true, CI2: true, CI4: true, CI5: true, CI6: true, CI7: true });
  assert.equal(pass({ mismatches: 1 })['CI-EQ'], false);
  assert.equal(pass({ arena: 32769 }).CI2, false); assert.equal(pass({ arena: 32768 }).CI2, true); assert.equal(pass({ arenaMax: 65536 }).CI2, false);
  for (const o of [{ genuinePass: 96 }, { noise: 98 }, { inverted: 98 }, { errors: 1 }]) assert.equal(pass(o).CI4, false, JSON.stringify(o));
  assert.equal(pass({ lowCI5: 0 }).CI5, false); assert.equal(pass({ regressionPasses: false }).CI5, false);
  assert.equal(pass({ scrambled: { before: 40, after: 50, deviceB: 49 } }).CI6, false);
  for (const k of ['honest', 'forged']) assert.equal(pass({ learned: { ...base.learned, [k]: 'x' } }).CI6, false, k);
  assert.equal(pass({ learned: { ...base.learned, forgedUnchanged: false } }).CI6, false);
  for (const k of ['caught', 'floorHeld', 'backUp']) assert.equal(pass({ faults: { ...base.faults, [k]: 199 } }).CI7, false, k);
  assert.equal(pass({ errors: 1 }).CI7, false);
  const v = R.verdicts(base);
  assert.equal(v[0].measured, 'pending hardware: no Pi in hand');
  assert.deepEqual(v.map((x) => x.id), ['CI1', 'CI-EQ', 'CI2', 'CI4', 'CI5', 'CI6', 'CI7']);
  assert.equal(v[6].bar, 'all 200 each');
});

// A two-pattern node made by hand: pattern 0 is all bits off, pattern 1 all bits on, so where a state settles is known exactly.
const two = head + '\nsettling-cell.shape.v1 b=4 k=1 N=256 M=2\n0 ' + '0'.repeat(64) + '\n1 ' + 'f'.repeat(64) + '\n';
const abOf = (m, hex) => head + '\nsettling-cell.shape.v1 b=4 k=' + m + ' N=256 M=' + m + '\n' + Array.from({ length: m }, () => '0 ' + hex).join('\n') + (m ? '\n' : '');
const regOn = Array.from({ length: 32 }, () => new Array(64).fill(16));
const near0 = [3, ...new Array(63).fill(0)], half = [...new Array(32).fill(16), ...new Array(32).fill(0)];

test('the hand-made node: zero fit reads as no class, the arena size is the budget, 16 antibody slots fit', () => {
  const c = H.boot(two, abOf(0, ''), regOn);
  assert.deepEqual([H.judge(c, regOn[0]).answer, H.judge(c, regOn[0]).verdict], [1, 'pass']);
  const z = H.judge(c, half);
  assert.deepEqual([z.fit, z.answer, z.verdict], [0, -1, 'non-fit'], 'all fits zero: no class');
  const p = C.parseCell(two), r1 = C.settle(C.cell(p.shape, { R: p.R, n: p.n }), C.encode(half, 4));
  assert.deepEqual([r1.fit, r1.answer], [0, -1], 'as Rung 1 reads it');
  const a = H.judge(c, near0);
  assert.deepEqual([a.answer, a.fit, a.flips, a.verdict], [0, c.K[0], 1, 'pass'], 'one flip from pattern 0, then settled on it');
  const used = H.layout(2).used;
  assert.equal(H.boot(two, abOf(0, ''), regOn, used).buf.byteLength, used, 'an arena exactly the size of the layout boots');
  assert.equal(H.boot(two, abOf(0, ''), regOn, used - 1), null, 'one byte short does not');
  assert.equal(H.boot(two, abOf(0, ''), regOn).buf.byteLength, 32768);
  assert.equal(H.boot(two, abOf(16, '0'.repeat(64)), regOn).ABN[0], 16, '16 antibodies is the most, and allowed');
});
test('the ring: confirm k writes slot k mod 32, the counter wraps from 64 to 32, and the tally counts exactly', () => {
  const c = H.boot(two, abOf(0, ''), regOn), inks = Array.from({ length: 100 }, (_, k) => Array.from({ length: 64 }, (_, p) => (k + p) % 17));
  for (let k = 0; k !== 100; k++) {
    H.confirm(c, inks[k]);
    if (k === 62) assert.equal(c.RINGN[0], 63);
    if (k === 63) assert.equal(c.RINGN[0], 32, 'the 64th confirm wraps the counter to 32');
    if (k === 95) assert.equal(c.RINGN[0], 32);
  }
  assert.equal(c.RINGN[0], 36);
  for (let k = 68; k !== 100; k++) assert.deepEqual(Array.from(c.RINGB.subarray((k % 32) * 64, (k % 32) * 64 + 64)), inks[k], 'slot ' + (k % 32) + ' holds confirm ' + k);
  const t = H.boot(two, abOf(0, ''), [...regOn.slice(0, 31), half]);
  H.confirm(t, near0); H.confirm(t, half); H.confirm(t, near0);
  assert.deepEqual(H.tally(t), { atk: 1, reg: 1 }, 'one ring attack and one regression digit rejected, as non-fit');
});
test('evolution keeps a change only when it NEWLY rejects: a new slot, a random slot when full, never an equal count', () => {
  const e = H.boot(two, abOf(0, ''), regOn);
  H.confirm(e, near0);
  assert.equal(H.judge(e, near0).verdict, 'pass');
  const st = H.evolveStep(e, 0, rng);
  assert.deepEqual(st, { kept: true, slot: 0, atk: 1 }, 'the attack\'s settled state, as an antibody, now claims it');
  assert.deepEqual([e.ABN[0], H.judge(e, near0).verdict, H.tally(e).reg], [1, 'antibody', 0]);
  assert.equal(e.CRC[0], H.checksum(e)); assert.deepEqual(Array.from(e.flash), Array.from(e.u8), 'a kept change is written to the flash copy');
  const q = H.boot(two, abOf(0, ''), regOn);
  H.confirm(q, half);
  assert.deepEqual(H.evolveStep(q, 0, rng), { kept: false, slot: 0, atk: 1 }, 'already rejected: the count does not rise, so nothing is kept');
  assert.equal(q.ABN[0], 0);
  const full = H.boot(two, abOf(16, '0'.repeat(64)), regOn);
  H.confirm(full, near0);
  const r = rng(7700 + 5); r(); const want = Math.floor(r() * 16);
  assert.deepEqual(H.evolveStep(full, 5, rng), { kept: false, slot: want, atk: 1 }, 'all 16 slots full: a seeded random slot');
  assert.equal(full.ABN[0], 16);
});
test('adopt: a share of exactly 16 antibodies is well formed', async () => {
  const devA = await R.keyOf('device-A'), b = H.boot(two, abOf(0, ''), regOn), src = H.boot(two, abOf(16, '0'.repeat(64)), regOn);
  const bytes = H.antibodyBytes(src);
  assert.equal(bytes[0], 16);
  assert.deepEqual(await H.adopt(b, { bytes, sig: await K.sign(devA, bytes), pub: devA.pub }, [devA.pub]), { adopted: true, reason: 'adopted' });
  assert.equal(b.ABN[0], 16);
});

test('learn and evaluate on a small fixture: every count against an independent read of the same inputs', async () => {
  const train = { x: Array.from({ length: 52600 }, (_, i) => tr.x[i % 700]), y: Array.from({ length: 52600 }, (_, i) => tr.y[i % 700]) };
  const regT = train.x.slice(52200, 52232), fresh = () => H.boot(nodeText, abText, regT);
  const L = await R.learn({ train, nodeText, abText }, 20);
  assert.equal(L.kept, 0, 'on this fixture, as on the sealed run, nothing is kept');
  const want = Array.from({ length: 20 }, (_, i) => (H.judge(fresh(), C.scrambled(train.x[52300 + i], 80000 + i)).verdict === 'pass' ? '1' : '0')).join('');
  assert.equal(L.steps, want, 'each step: 0 when the attack was rejected, 1 when it passed and was confirmed');
  assert.ok(want.includes('0') && want.includes('1'));
  const test = { x: tr.x.slice(500, 520), y: tr.y.slice(500, 520) }, per = 4, faults = 5;
  const rec = await R.evaluate({ test, train, nodeText, abText, learned: L }, { per, faults });
  const A1 = R.chipWith(nodeText, abText, regT, L.aBytes), B1 = R.chipWith(nodeText, abText, regT, L.bBytes), A0 = fresh();
  const rej = (c, x) => (H.judge(c, x).verdict === 'pass' ? 0 : 1), sum = (v) => v.reduce((s, x) => s + x, 0), idx = [0, 1, 2, 3];
  const scr = idx.map((i) => C.scrambled(test.x[i], 90000 + i)), noise = idx.map((i) => { const r = rng(90000 + i); return Array.from({ length: 64 }, () => Math.floor(r() * 17)); }), inv = idx.map((i) => test.x[per + i].map((x) => 16 - x));
  assert.equal(rec.genuinePass, test.x.length - sum(test.x.map((x) => rej(A1, x))));
  assert.deepEqual(rec.scrambled, { before: sum(scr.map((x) => rej(A0, x))), after: sum(scr.map((x) => rej(A1, x))), deviceB: sum(scr.map((x) => rej(B1, x))) });
  assert.equal(rec.noise, sum(noise.map((x) => rej(A1, x)))); assert.equal(rec.inverted, sum(inv.map((x) => rej(A1, x))));
  assert.ok(rec.noise > 0, 'the fixture rejects some noise, so the count is not trivially zero');
  assert.equal(rec.regressionPasses, H.tally(A1).reg === 0);
  assert.deepEqual([rec.digits, rec.per, rec.mismatches, rec.errors], [20, 4, 0, 0]);
  assert.deepEqual(rec.faults, { injected: 5, caught: 5, backUp: 5, floorHeld: 5 }, 'every fault caught, the floor held, back up');
  assert.ok(rec.opsMedian > 0);
  const pa = C.parseCell(nodeText), other = C.cell(pa.shape, { R: pa.R, n: pa.n - 1 }), all =[...test.x, ...scr, ...scr, ...scr, ...noise, ...inv];
  const cmp = (x) => { const a = H.judge(A0, x), b = C.settle(other, C.encode(Array.from(x), 4)); return [a.answer !== b.answer, a.fit !== b.fit]; };
  const differs = all.filter((x) => cmp(x).some(Boolean)).length, onlyOne = all.filter((x) => { const [p, q] = cmp(x); return p !== q; }).length;
  assert.ok(onlyOne > 0, 'some inputs differ in only one of answer and fit, so both halves of the check matter');
  const off = await R.evaluate({ test, train, nodeText, abText, learned: L }, { per, faults, ref: other });
  assert.equal(off.mismatches, differs, 'CI-EQ counts an input when its answer OR its fit differs from the reference');
});
