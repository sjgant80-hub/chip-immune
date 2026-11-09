// The page and the files, held to their sealed claims: CI3 (no model, no cloud in the chip core), CI9 (no measured number
// typed into the page), CI10 (the data and every vendored file are the pinned bytes), seal 2 naming what the held-out side
// was read with, CI1 shown as not tested, the emulator labelled, the credits, the failures told.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const sha = (p) => createHash('sha256').update(readFileSync(new URL(p, ROOT))).digest('hex');
const html = read('index.html'), app = read('app.mjs'), claims = read('CLAIMS.md');

test('CI10: the data and every vendored file are the pinned bytes', () => {
  for (const p of ['vendor/settling-cell/src/cell.mjs', 'vendor/hybrid-gate/src/mnist.mjs', 'vendor/mesh-share/data/cell-after.txt', 'vendor/geometric-defence/data/antibodies.txt']) assert.ok(claims.includes(sha(p)), p + ' is what seal 1 names');
  const pinned = new Map();
  for (const s of JSON.parse(read('vendor/SOURCES.json')).sources) for (const f of s.files) pinned.set(f.path, f.sha256);
  const files = [];
  (function walk(d) { for (const n of readdirSync(new URL(d, ROOT))) { const p = d + '/' + n; if (statSync(new URL(p, ROOT)).isDirectory()) walk(p); else files.push(p); } })('vendor');
  for (const f of files.filter((x) => x !== 'vendor/SOURCES.json')) { assert.ok(pinned.has(f), f + ' is not pinned'); assert.equal(sha(f), pinned.get(f), f + ' changed'); }
  assert.equal(sha('data/mnist/t10k-images-idx3-ubyte.gz'), '8d422c7b0a1c1c79245a5bcf07fe86e33eeafee792b84584aec276f5a2dbc4e6');
  assert.equal(sha('data/mnist/t10k-labels-idx1-ubyte.gz'), 'f7ae60f92e00ec6debd23a6088c31dbd2371eca3ffa0defaefb259924204aec6');
  assert.equal(sha('data/mnist/train-images-idx3-ubyte.gz'), '440fcabf73cc546fa21475e81ea370265605f56be210a4024d2ca8f203523609');
  assert.equal(sha('data/mnist/train-labels-idx1-ubyte.gz'), '3552534a0a558bbed6aed32b30c495cca23d567ec52cac8be1a0730e8010255c');
});
test('CI3: the chip core has no model and no cloud: it imports only the vendored keys, and makes no network call', () => {
  const core = read('src/chip.mjs');
  assert.deepEqual([...core.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), ['../vendor/living-seed/vendor/keys/keys.mjs']);
  assert.equal(/\bfetch\b|XMLHttpRequest|WebSocket|https?:\/\/|\bimport\(/.test(core), false);
  const keys = read('vendor/living-seed/vendor/keys/keys.mjs');
  assert.equal(/\bfetch\b|XMLHttpRequest|WebSocket|\bimport\(/.test(keys), false, 'the keys make no network call either');
});
test('seal 2 names the chip, the learning record and the shapes', () => {
  const seal = read('SEAL2.md');
  for (const f of ['src/chip.mjs', 'data/learned.json', 'vendor/mesh-share/data/cell-after.txt', 'vendor/geometric-defence/data/antibodies.txt']) assert.ok(seal.includes(sha(f)), f);
});
test('CI9: no measured number is typed into the page', () => {
  const r = JSON.parse(read('data/record.json')).record, forms = new Set();
  for (const v of [r.genuinePass / r.digits, r.noise / r.per, r.inverted / r.per, r.scrambled.before / r.per, r.scrambled.after / r.per]) if (v > 0 && v < 1) forms.add((v * 100).toFixed(1) + '%');
  for (const n of [r.genuinePass, r.arena, r.opsMedian]) forms.add(String(n)), forms.add(n.toLocaleString('en-GB'));
  forms.add(String(r.msEstimate)); forms.add(r.hash.slice(0, 12));
  const visible = html.replace(/<style>[\s\S]*?<\/style>/, '');
  for (const s of forms) assert.equal(visible.includes(s), false, 'the page has "' + s + '" typed in; it must come from the record');
  assert.match(app, /pct\(r\.genuinePass \/ r\.digits\)/);
});
test('the emulator is labelled, CI1 is not tested, the failures are told, the page explains itself and carries its credits', () => {
  assert.match(html, /It has not run on a real chip yet\./);
  assert.match(html, /CI1\) is pending hardware/);
  assert.match(app, /'NOT TESTED'/);
  assert.equal(JSON.parse(read('data/record.json')).verdicts.find((v) => v.id === 'CI1').pass, false, 'CI1 is never reported held');
  assert.match(app, /pass \? 'HELD' : 'FAILED'/);
  assert.match(app, /Failed and kept: /);
  assert.match(app, /Each failure is kept on the record and on this page\./);
  assert.match(html, /A claim that misses its bar is kept and shown as failed\./);
  for (const id of ['result', 'chip', 'try', 'rerun', 'what', 'start', 'how', 'blueprint', 'adoption', 'paper', 'business']) assert.match(html, new RegExp('<section id="' + id + '"'), id);
  assert.match(html, /connect-src 'self'/);
  assert.match(html, /Powered by the Konomi architecture, created by Thomas Frumkin/);
  assert.match(html, /Y\. LeCun, C\. Cortes and C\. J\. C\. Burges, CC BY-SA 3\.0/);
  assert.equal(/£\s?\d|\$\s?\d|per seat|\/mo\b/i.test(html), false, 'no price of ours on the page');
});
