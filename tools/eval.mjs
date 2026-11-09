#!/usr/bin/env node
// tools/eval.mjs — the held-out judgement on chip-sim (an EMULATOR), read once. It refuses to run unless SEAL2.md names
// the learning record and the vendored shapes by their SHA-256 and the MNIST test files are the pinned ones.
// Writes data/record.json; `--check` re-derives it (CI).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { train, test } from './data.mjs';
import R from '../src/run.mjs';

const PINS = { 't10k-images-idx3-ubyte.gz': '8d422c7b0a1c1c79245a5bcf07fe86e33eeafee792b84584aec276f5a2dbc4e6', 't10k-labels-idx1-ubyte.gz': 'f7ae60f92e00ec6debd23a6088c31dbd2371eca3ffa0defaefb259924204aec6' };
const ROOT = new URL('../', import.meta.url);
const raw = (p) => readFileSync(new URL(p, ROOT));
const read = (p) => raw(p).toString('utf8');
const sha = (p) => createHash('sha256').update(raw(p)).digest('hex');
const stop = (why) => { console.error('eval: ' + why); process.exit(1); };
if (!existsSync(new URL('SEAL2.md', ROOT))) stop('no SEAL2.md: the chip is not frozen, so the test digits may not be read');
const seal = read('SEAL2.md');
for (const f of ['data/learned.json', 'vendor/mesh-share/data/cell-after.txt', 'vendor/geometric-defence/data/antibodies.txt', 'src/chip.mjs']) if (!seal.includes(sha(f))) stop(f + ' is not what seal 2 names');
for (const [f, h] of Object.entries(PINS)) if (sha('data/mnist/' + f) !== h) stop(f + ' is not the file seal 1 pinned');
const t0 = Date.now();
const record = await R.evaluate({ test: test(), train: train(), nodeText: read('vendor/mesh-share/data/cell-after.txt'), abText: read('vendor/geometric-defence/data/antibodies.txt'), learned: JSON.parse(read('data/learned.json')) });
const out = JSON.stringify({ record, verdicts: R.verdicts(record) }, null, 1) + '\n';
if (process.argv.includes('--check')) { const same = read('data/record.json') === out; console.log(same ? 'RECORD REPRODUCED · ' + record.hash.slice(0, 16) : 'RECORD DIFFERS'); process.exit(same ? 0 : 1); }
writeFileSync(new URL('data/record.json', ROOT), out);
console.log('emulator held-out: ' + record.digits + ' test digits, ' + Math.round((Date.now() - t0) / 1000) + ' s · ops/input ' + record.opsMedian + ' (~' + record.msEstimate + ' ms at 240 MHz, estimate) · record ' + record.hash);
for (const v of R.verdicts(record)) console.log((v.pass ? '  held   ' : '  FAILED ') + v.id + ' · ' + v.what + ' · ' + JSON.stringify(v.measured) + ' (bar ' + v.bar + ')');
