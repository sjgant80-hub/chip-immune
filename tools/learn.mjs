#!/usr/bin/env node
// tools/learn.mjs — the learning side, on training digits only: device A's stream, its evolved antibodies, and the share
// to device B. Writes data/learned.json. `--check` re-derives it byte for byte (CI).
import { readFileSync, writeFileSync } from 'node:fs';
import { train } from './data.mjs';
import R from '../src/run.mjs';
const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const t0 = Date.now(), r = await R.learn({ train: train(), nodeText: read('vendor/mesh-share/data/cell-after.txt'), abText: read('vendor/geometric-defence/data/antibodies.txt') });
const out = JSON.stringify(r) + '\n';
if (process.argv.includes('--check')) { const same = read('data/learned.json') === out; console.log(same ? 'LEARN REPRODUCED' : 'LEARN DIFFERS'); process.exit(same ? 0 : 1); }
writeFileSync(new URL('data/learned.json', ROOT), out);
console.log('learn in ' + Math.round((Date.now() - t0) / 1000) + ' s · of 300 confirmed scrambled attacks, ' + r.passed + ' got past the layer and were confirmed; ' + r.kept + ' evolution steps kept; A now holds ' + r.aCount + ' antibodies · B: honest ' + r.honest.reason + ', forged ' + r.forged.reason + ' (B unchanged ' + r.forgedUnchanged + ') · arena ' + r.arena + ' bytes');
