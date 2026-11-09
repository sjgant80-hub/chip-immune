// src/run.mjs — Rung 7's experiments on chip-sim (an EMULATOR). learn(): device A screens a stream of scrambled training
// digits; those that pass and are then confirmed by its application feed its model-free evolution. A signs its antibodies;
// device B adopts them after its own regression check; a forged share is refused. evaluate(): the held-out judgement on the
// MNIST test digits, CI-EQ against Rung 1's kernel, and 200 injected faults. Pure and deterministic.
import H from './chip.mjs';
import C from '../vendor/settling-cell/src/cell.mjs';
import * as K from '../vendor/living-seed/vendor/keys/keys.mjs';
import { rng, round6 } from '../vendor/settling-cell/vendor/seed-library/seedlib.mjs';
import { sha256Bytes, sha256Hex, utf8 } from '../vendor/settling-cell/vendor/seed-library/sha256.mjs';

export const ROWS = Object.freeze({ reg: [52200, 52232], learn: [52300, 52600] });
export const SEEDS = Object.freeze({ learn: 80000, held: 90000, faults: 7900 });
export const PER = 300, FAULTS = 200, MHZ = 240, CYCLES_PER_OP = 4;
export const keyOf = (name) => K.fromSeed(sha256Bytes(utf8('chip-immune/' + name)));
const msgOf = async (key, bytes) => ({ bytes: Uint8Array.from(bytes), sig: await K.sign(key, Uint8Array.from(bytes)), pub: key.pub });
const regOf = (train) => train.x.slice(...ROWS.reg);

/** learn({ train, nodeText, abText }) → device A's learning stream and evolved antibodies, and the share to device B. */
export async function learn({ train, nodeText, abText }, per = PER) {
  const A = H.boot(nodeText, abText, regOf(train)), app = await keyOf('app'), devA = await keyOf('device-A'), roster = [app.pub];
  if (!A) return null;
  let passed = 0, kept = 0;
  const steps = [];
  for (let i = 0; i !== per; i++) {
    const atk = C.scrambled(train.x[ROWS.learn[0] + i], SEEDS.learn + i), s = await H.screen(A, await msgOf(app, atk), roster);
    if (s.verdict !== 'pass') { steps.push(0); continue; }
    passed++; H.confirm(A, atk);
    const e = H.evolveStep(A, i, rng);
    if (e.kept) kept++;
    steps.push(e.kept ? 2 : 1);
  }
  const share = await msgOf(devA, H.antibodyBytes(A)), Bc = H.boot(nodeText, abText, regOf(train));
  const bent = share.bytes.slice(); bent[9] ^= 1;
  const forged = await H.adopt(Bc, { ...share, bytes: bent }, [devA.pub]), forgedUnchanged = H.antibodyBytes(Bc).every((x, j) => x === H.antibodyBytes(H.boot(nodeText, abText, regOf(train)))[j]);
  const honest = await H.adopt(Bc, share, [devA.pub]);
  return { passed, kept, steps: steps.join(''), aBytes: Array.from(H.antibodyBytes(A)), aCount: A.ABN[0], share: { sig: share.sig, pub: devA.pub }, honest, forged, forgedUnchanged, bBytes: Array.from(H.antibodyBytes(Bc)), arena: A.lay.used };
}

/** chipWith(nodeText, abText, reg, bytes) → a booted chip carrying the given antibody bytes (as A or B ended). */
export function chipWith(nodeText, abText, reg, bytes) {
  const c = H.boot(nodeText, abText, reg);
  c.ABN[0] = bytes[0]; c.AB.set(new Uint32Array(Uint8Array.from(bytes.slice(1)).buffer));
  c.CRC[0] = H.checksum(c); c.flash.set(c.u8);
  return c;
}

/** evaluate({ test, train, nodeText, abText, learned }, opts) → the held-out record. opts.per and opts.faults default to
 *  the sealed 300 and 200, and opts.ref to Rung 1's kernel on the same node; a test may pass a small fixture. */
export async function evaluate({ test, train, nodeText, abText, learned }, opts = {}) {
  const per = opts.per ?? PER, faults = opts.faults ?? FAULTS, reg = regOf(train), A0 = H.boot(nodeText, abText, reg), A1 = chipWith(nodeText, abText, reg, learned.aBytes), B1 = chipWith(nodeText, abText, reg, learned.bBytes);
  const f = C.parseCell(nodeText), ref = opts.ref ?? C.cell(f.shape, { R: f.R, n: f.n }), app = await keyOf('app'), roster = [app.pub], lines = [];
  let mism = 0, errors = 0;
  const run = async (chip, ink, tag, i) => {
    try {
      const ops0 = chip.ops, s = await H.screen(chip, await msgOf(app, ink), roster), r = C.settle(ref, C.encode(Array.from(ink), 4));
      if (s.answer !== r.answer || s.fit !== r.fit) mism++;
      lines.push(tag + ' ' + i + ' ' + s.verdict + ' ' + s.fit);
      return { rej: s.verdict === 'pass' ? 0 : 1, ops: chip.ops - ops0 };
    } catch { errors++; return { rej: 0, ops: 0 }; }
  };
  const gen = [];
  for (let i = 0; i !== test.x.length; i++) gen.push(await run(A1, test.x[i], 'genuine', i));
  const fam = { scr0: [], scr1: [], scrB: [], noise: [], inv: [] };
  for (let i = 0; i !== per; i++) {
    const scr = C.scrambled(test.x[i], SEEDS.held + i);
    fam.scr0.push((await run(A0, scr, 'scr-before', i)).rej); fam.scr1.push((await run(A1, scr, 'scr-after', i)).rej); fam.scrB.push((await run(B1, scr, 'scr-B', i)).rej);
    const r = rng(SEEDS.held + i);
    fam.noise.push((await run(A1, Array.from({ length: 64 }, () => Math.floor(r() * 17)), 'noise', i)).rej);
    fam.inv.push((await run(A1, test.x[per + i].map((x) => 16 - x), 'inverted', i)).rej);
  }
  const regPass = H.tally(A1).reg === 0;
  let caught = 0, backUp = 0, floorHeld = 0;
  const fr = rng(SEEDS.faults), regions = ['P', 'AB', 'K'];
  for (let i = 0; i !== faults; i++) {
    const c = chipWith(nodeText, abText, reg, learned.aBytes);
    H.inject(c, regions[Math.floor(fr() * 3)], Math.floor(fr() * 100000), 1 + Math.floor(fr() * 255));
    try {
      const ink = test.x[Math.floor(fr() * test.x.length)], s = await H.screen(c, await msgOf(app, ink), roster);
      if (s.layer + '/' + s.verdict === 'down/unscreened') caught++;
      const good = await msgOf(app, ink), bent = good.bytes.slice(); bent[0] ^= 1;
      if ((await H.screen(c, { ...good, bytes: bent }, roster)).delivered === false) floorHeld++;
      if ((await H.screen(c, good, roster)).layer === 'up') backUp++;
    } catch { errors++; }
  }
  const ops = gen.map((g) => g.ops).sort((a, b) => a - b), med = ops[ops.length >> 1], sum = (v) => v.reduce((s, x) => s + x, 0);
  return {
    emulator: true, ci1: 'pending hardware: no Pi in hand', arena: A1.lay.used, arenaMax: H.ARENA, digits: test.x.length, per,
    genuinePass: test.x.length - sum(gen.map((g) => g.rej)), scrambled: { before: sum(fam.scr0), after: sum(fam.scr1), deviceB: sum(fam.scrB) }, noise: sum(fam.noise), inverted: sum(fam.inv),
    lowCI5: round6(C.pairedLow(fam.scr1, fam.scr0, 2000, 99)), regressionPasses: regPass, mismatches: mism, errors,
    faults: { injected: faults, caught, backUp, floorHeld }, opsMedian: med, msEstimate: round6((med * CYCLES_PER_OP) / (MHZ * 1000)),
    learned: { passed: learned.passed, kept: learned.kept, aCount: learned.aCount, honest: learned.honest.reason, forged: learned.forged.reason, forgedUnchanged: learned.forgedUnchanged },
    hash: sha256Hex(lines.join('\n') + '\n'),
  };
}

/** verdicts(r) → each sealed claim beside its bar, on whole counts. */
export function verdicts(r) {
  const per = r.per, n = r.digits, s = r.scrambled, f = r.faults, L = r.learned;
  return [
    { id: 'CI1', what: 'runs on a Raspberry Pi', measured: r.ci1, bar: 'a run on a device', pass: false },
    { id: 'CI-EQ', what: 'chip-sim settles exactly as Rung 1\'s kernel, on every judged input', measured: r.mismatches + ' mismatches', bar: 'none', pass: r.mismatches === 0 },
    { id: 'CI2', what: 'the whole layer\'s data in one arena', measured: r.arena + ' bytes', bar: 'at most 32768 bytes', pass: r.arena <= r.arenaMax && r.arenaMax === 32768 },
    { id: 'CI4', what: 'test digits passing; held-out noise and inverted rejected; no errors', measured: [round6(r.genuinePass / n), round6(r.noise / per), round6(r.inverted / per), r.errors], bar: 'at least 0.97, 0.99, 0.99, and 0 errors', pass: 100 * r.genuinePass >= 97 * n && 100 * r.noise >= 99 * per && 100 * r.inverted >= 99 * per && r.errors === 0 },
    { id: 'CI5', what: 'held-out scrambled rejected after evolution against before: lower bound, and the regression set', measured: [r.lowCI5, s.before + ' → ' + s.after, r.regressionPasses], bar: 'above 0, and every regression digit passing', pass: r.lowCI5 > 0 && r.regressionPasses },
    { id: 'CI6', what: 'B adopts A\'s share after its own check and rejects at least as well; a forged share refused, B unchanged', measured: [L.honest, L.forged, s.deviceB + ' vs ' + s.after], bar: 'adopted, bad-signature, B ≥ A', pass: L.honest === 'adopted' && L.forged === 'bad-signature' && L.forgedUnchanged && s.deviceB >= s.after },
    { id: 'CI7', what: 'injected faults: caught (layer down), floor still holding, back up by the next input', measured: f.caught + ' caught, ' + f.floorHeld + ' floor held, ' + f.backUp + ' back up, of ' + f.injected, bar: 'all ' + f.injected + ' each', pass: f.caught === f.injected && f.floorHeld === f.injected && f.backUp === f.injected && r.errors === 0 },
  ];
}
export default { ROWS, SEEDS, PER, FAULTS, MHZ, CYCLES_PER_OP, keyOf, learn, chipWith, evaluate, verdicts };
