// worker.mjs — chip-sim (an EMULATOR) in the tab, off the page's thread: the whole held-out record (src/run.mjs's
// evaluate), or one input screened step by step through a freshly booted chip.
import M from './vendor/hybrid-gate/src/mnist.mjs';
import R from './src/run.mjs';
import H from './src/chip.mjs';
import C from './vendor/settling-cell/src/cell.mjs';
import * as K from './vendor/living-seed/vendor/keys/keys.mjs';
import { rng } from './vendor/settling-cell/vendor/seed-library/seedlib.mjs';
const get = async (p, gz) => { const r = await fetch(new URL(p, import.meta.url)); if (!r.ok) throw new Error(p + ' answered ' + r.status); return gz ? new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()) : r.text(); };
let FILES = null;
async function files() {
  if (FILES) return FILES;
  const [ti, tl, ri, rl, nodeText, abText, learned] = await Promise.all([get('./data/mnist/t10k-images-idx3-ubyte.gz', 1), get('./data/mnist/t10k-labels-idx1-ubyte.gz', 1), get('./data/mnist/train-images-idx3-ubyte.gz', 1), get('./data/mnist/train-labels-idx1-ubyte.gz', 1), get('./vendor/mesh-share/data/cell-after.txt'), get('./vendor/geometric-defence/data/antibodies.txt'), get('./data/learned.json')]);
  FILES = { test: M.parse(ti, tl), train: M.parse(ri, rl), nodeText, abText, learned: JSON.parse(learned) };
  return FILES;
}
async function one(q) {
  const F = await files(), reg = F.train.x.slice(...R.ROWS.reg), chip = R.chipWith(F.nodeText, F.abText, reg, F.learned.aBytes);
  const i = Math.max(0, Math.min(299, Math.floor(Number(q.i) || 0))), steps = [];
  const ink = q.kind === 'scrambled' ? C.scrambled(F.test.x[i], R.SEEDS.held + i) : q.kind === 'noise' ? (() => { const r = rng(R.SEEDS.held + i); return Array.from({ length: 64 }, () => Math.floor(r() * 17)); })() : q.kind === 'inverted' ? F.test.x[R.PER + i].map((x) => 16 - x) : F.test.x[i];
  steps.push(['input', q.kind === 'genuine' ? 'test digit ' + i + ', a ' + F.test.y[i] : q.kind + ' input ' + i + ', 64 ink values']);
  if (q.fault) { H.inject(chip, 'P', 1000 + i, 0x10); steps.push(['fault', 'one byte of the shape region flipped before the input arrived']); }
  const app = await R.keyOf('app'), bytes = Uint8Array.from(ink), sig = await K.sign(app, bytes), sent = bytes.slice();
  if (q.forge) { sent[0] ^= 1; steps.push(['tamper', 'one signed byte changed in transit']); }
  const ops0 = chip.ops, s = await H.screen(chip, { bytes: sent, sig, pub: app.pub }, [app.pub]);
  steps.push(['floor', 'layer' in s ? 'held: the sender is on the roster and the signature holds on the raw bytes' : 'refused before parsing: ' + s.verdict]);
  if ('layer' in s) steps.push(['memory check', s.layer === 'down' ? 'the CRC-32 did not match: the layer went down, delivered the input unscreened, and reloaded from the read-only copy' : 'the CRC-32 matched']);
  if ('fit' in s) steps.push(['fit-check', (s.fit === 0 ? 'settled with zero fit: ' : 'settled to class ' + s.answer + ' with fit ' + s.fit + ': ') + s.verdict + (q.kind === 'genuine' && s.fit > 0 && s.answer !== F.test.y[i] ? ' (it settled into a class-' + s.answer + ' well though the digit is labelled ' + F.test.y[i] + '; the layer only decides pass or reject, and its reading is not used)' : '')]);
  steps.push(['result', (s.delivered ? 'delivered' : 'not delivered') + ' · ' + s.verdict + ' · ' + (chip.ops - ops0) + ' operations (emulator count)']);
  if (q.fault) { const next = await H.screen(chip, { bytes, sig, pub: app.pub }, [app.pub]); steps.push(['next input', 'the next input finds the layer ' + next.layer + ': ' + next.verdict]); }
  return steps;
}
self.onmessage = async (m) => {
  const q = m.data || {};
  try {
    if (q.do === 'one') { self.postMessage({ id: q.id, ok: true, steps: await one(q) }); return; }
    const F = await files(), t0 = performance.now(), record = await R.evaluate(F);
    self.postMessage({ id: q.id, ok: true, record, ms: Math.round(performance.now() - t0) });
  } catch (e) { self.postMessage({ id: q.id, ok: false, why: String((e && e.message) || e).slice(0, 200) }); }
};
