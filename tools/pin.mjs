#!/usr/bin/env node
// tools/pin.mjs — writes vendor/SOURCES.json: the SHA-256 of every vendored file and where it came from.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ROOT = new URL('../', import.meta.url);
const sha = (p) => createHash('sha256').update(readFileSync(new URL(p, ROOT))).digest('hex');
const sources = [
  { from: 'sjgant80-hub/settling-cell', commit: 'e589c48', files: [['vendor/settling-cell/src/cell.mjs', 'src/cell.mjs'], ['vendor/settling-cell/vendor/seed-library/seedlib.mjs', 'vendor/seed-library/seedlib.mjs'], ['vendor/settling-cell/vendor/seed-library/sha256.mjs', 'vendor/seed-library/sha256.mjs']] },
  { from: 'sjgant80-hub/hybrid-gate', commit: 'a1e7f72', files: [['vendor/hybrid-gate/src/mnist.mjs', 'src/mnist.mjs']] },
  { from: 'sjgant80-hub/mesh-share', commit: '9088b98', files: [['vendor/mesh-share/data/cell-after.txt', 'data/cell-after.txt']] },
  { from: 'sjgant80-hub/geometric-defence', commit: '1cb3e45', files: [['vendor/geometric-defence/data/antibodies.txt', 'data/antibodies.txt']] },
  { from: 'sjgant80-hub/living-seed', commit: 'a8c054d', files: [['vendor/living-seed/vendor/keys/keys.mjs', 'vendor/keys/keys.mjs'], ['vendor/living-seed/vendor/keys/canon.mjs', 'vendor/keys/canon.mjs']] },
  { from: 'sjgant80-hub/liveware', commit: '48205c7', files: [['vendor/liveware/mintcase.mjs', 'src/mintcase.mjs'], ['vendor/liveware/basis.json', 'vendor/ai-first-company/vendor/sovereign-enterprise/data/basis.json']] },
];
const out = { note: 'Vendored byte for byte; test/page.test.mjs checks every sha256, and nothing under vendor/ may be unpinned.',
  sources: sources.map((s) => ({ from: s.from, commit: s.commit, files: s.files.map(([path, src]) => ({ path, src, sha256: sha(path) })) })) };
writeFileSync(new URL('vendor/SOURCES.json', ROOT), JSON.stringify(out, null, 1) + '\n');
console.log(out.sources.reduce((n, s) => n + s.files.length, 0) + ' files pinned');
