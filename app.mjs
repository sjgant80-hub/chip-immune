// app.mjs — the page's glue. Every number is read from the committed record, the learning record or the gate receipts,
// or computed in this tab from the same code chip-sim runs (claim CI9: none is typed into index.html). Every number from
// the emulator is labelled as such. The re-run and "screen one input" run in worker.mjs.
import { mintCase, sourcesOf } from './vendor/liveware/mintcase.mjs';
import H from './src/chip.mjs';
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(props)) if (k === 'class') e.className = v; else e.setAttribute(k, v); for (const c of kids) e.append(c); return e; };
const json = (p) => fetch(p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const text = (p) => fetch(p).then((r) => (r.ok ? r.text() : null)).catch(() => null);
const pct = (x) => (x * 100).toFixed(1) + '%';
const big = (n) => Number(n).toLocaleString('en-GB');
const chip = (v) => (v.id === 'CI1' ? el('span', { class: 'chip', style: 'color:var(--tie);border-color:var(--tie)' }, 'NOT TESTED') : el('span', { class: 'chip ' + (v.pass ? 'win' : 'bad') }, v.pass ? 'HELD' : 'FAILED'));
let REC = null, GATES = [], BASIS = null, LEARNED = null;
const PLAIN = { CI1: 'Runs on a Raspberry Pi', 'CI-EQ': 'The emulated chip settles exactly as Rung 1\'s cell', CI2: 'The whole layer fits a microcontroller\'s memory', CI4: 'Real digits pass, noise and inverted attacks rejected, no errors', CI5: 'Self-improvement in spare cycles raises held-out rejection, regression set kept', CI6: 'Device B adopts A\'s signed antibodies and rejects as well; a forged share refused', CI7: 'Fail-safe under injected memory faults' };
const REGION = { K: 'the energy table', P: 'the stored shape (patterns)', AB: 'the antibodies (16 slots)', S: 'the settling state', SCR: 'scratch', CRC: 'the checksum', D: 'distances to every pattern', CLS: 'each pattern\'s class', ABN: 'how many antibodies', REG: 'the 32 regression digits', RING: 'the last 32 confirmed attacks', RINGN: 'the ring counter' };
function show(v, r) {
  const m = v.measured;
  if (v.id === 'CI4') return pct(m[0]) + ' of test digits pass · noise ' + pct(m[1]) + ' and inverted ' + pct(m[2]) + ' rejected · ' + m[3] + ' errors';
  if (v.id === 'CI5') return 'lower bound ' + (m[0] * 100).toFixed(2) + ' points · scrambled rejected ' + m[1] + ' of ' + r.per + ' · regression set ' + (m[2] ? 'kept' : 'broken');
  if (v.id === 'CI6') return 'B ' + m[0] + ' A\'s share · forged share ' + m[1] + ' · B rejects ' + m[2];
  return String(m);
}
function fill() {
  const r = REC.record, v = REC.verdicts, held = v.filter((x) => x.pass), failed = v.filter((x) => !x.pass && x.id !== 'CI1');
  $('verdictline').textContent = 'On the emulator, ' + held.length + ' of ' + (v.length - 1) + ' measured claims held, and the run on a real Raspberry Pi is not tested yet. The whole layer fits in ' + big(r.arena) + ' bytes; ' + pct(r.genuinePass / r.digits) + ' of the ' + big(r.digits) + ' test digits pass.' + (failed.length ? ' Failed and kept: ' + failed.map((x) => x.id).join(', ') + '.' : '');
  const tb = $('claims').querySelector('tbody'); tb.replaceChildren();
  for (const x of v) tb.append(el('tr', {}, el('td', {}, el('b', {}, x.id)), el('td', {}, PLAIN[x.id]), el('td', {}, show(x, r)), el('td', {}, x.bar), el('td', {}, chip(x))));
  for (const [id, w] of [['CI3', 'No model and no cloud: the chip core imports only the vendored keys, and makes no network call'], ['CI8', 'Deterministic: the record re-derives byte for byte on GitHub\'s runner and in your tab'], ['CI9', 'No measured number typed into this page'], ['CI10', 'The MNIST files and every vendored file are the pinned bytes']]) tb.append(el('tr', {}, el('td', {}, el('b', {}, id)), el('td', {}, w), el('td', {}, 'checked in CI'), el('td', {}, '—'), el('td', {}, el('span', { class: 'chip win' }, 'CI'))));
  for (const g of GATES) tb.append(el('tr', {}, el('td', {}, el('b', {}, 'G')), el('td', {}, 'Mutation gate on ' + g.kernel), el('td', { class: 'num' }, g.killed + ' of ' + g.total + ' caught, ' + g.ignored + ' baselined'), el('td', {}, 'clean'), el('td', {}, chip({ pass: g.clean && g.ignored === 0 }))));
  const L = r.learned, s = r.scrambled, f = r.faults;
  $('lesson').textContent = 'The layer fits a small device and fails safe: ' + big(f.caught) + ' of ' + big(f.injected) + ' injected faults were caught, the signature floor held on ' + big(f.floorHeld) + ' and the layer was back up for the next input on ' + big(f.backUp) + '. Noise and inverted attacks are rejected (' + pct(r.noise / r.per) + ' and ' + pct(r.inverted / r.per) + '). ' + (L.kept === 0 ? 'But the self-improvement did not work: of ' + big(L.passed) + ' confirmed attacks that got through while learning, no change was kept, so held-out scrambled rejection stayed at ' + big(s.before) + ' → ' + big(s.after) + ' of ' + big(r.per) + '. A scrambled digit that settles into a real digit\'s well lands on that digit\'s own stored pattern, so an antibody there would claim real digits too, and one regression digit already settles with zero fit, so the "rejects none of the regression set" rule cannot be met. It is the same wall Rungs 1, 3 and 5 hit: the settle erases the information an attack detector needs. So CI6 held only in the narrow sense: B adopted A\'s share after its own check, but the share carried nothing new; what CI6 does show is that the forged share was refused and left B unchanged.' :'In spare cycles device A kept ' + big(L.kept) + ' changes from ' + big(L.passed) + ' confirmed attacks; held-out scrambled rejection went ' + big(s.before) + ' → ' + big(s.after) + ' of ' + big(r.per) + '.');
  const ul = $('results'); ul.replaceChildren();
  ul.append(el('li', {}, 'Memory (emulator): the whole layer in ' + big(r.arena) + ' of ' + big(r.arenaMax) + ' bytes.'));
  ul.append(el('li', {}, 'Same cell: ' + big(r.mismatches) + ' mismatches against Rung 1\'s kernel on every judged input.'));
  ul.append(el('li', {}, 'Test digits passing: ' + big(r.genuinePass) + ' of ' + big(r.digits) + ' (' + pct(r.genuinePass / r.digits) + ').'));
  ul.append(el('li', {}, 'Held-out attacks rejected, of ' + r.per + ' each: noise ' + big(r.noise) + ', inverted ' + big(r.inverted) + ', scrambled ' + big(s.before) + ' before learning, ' + big(s.after) + ' after, ' + big(s.deviceB) + ' on device B.'));
  ul.append(el('li', {}, 'Learning on device A: ' + big(L.passed) + ' confirmed attacks, ' + big(L.kept) + ' changes kept, ' + big(L.aCount) + ' antibodies held. Device B: A\'s share ' + L.honest + '; the forged share ' + L.forged + (L.forgedUnchanged ? ', B unchanged.' : '.')));
  ul.append(el('li', {}, 'Faults: ' + big(f.caught) + ' caught, ' + big(f.floorHeld) + ' floor held, ' + big(f.backUp) + ' back up, of ' + big(f.injected) + '; ' + big(r.errors) + ' errors.'));
  ul.append(el('li', {}, 'Work per input (emulator estimate): median ' + big(r.opsMedian) + ' operations, about ' + r.msEstimate + ' ms at 240 MHz and 4 cycles per operation.'));
  for (const g of GATES) ul.append(el('li', {}, 'Mutation gate on ' + g.kernel + ': ' + g.killed + ' of ' + g.total + ' caught, ' + g.ignored + ' baselined.'));
  $('budget').replaceChildren(...[['Memory used', big(r.arena) + ' bytes', 'of a ' + big(r.arenaMax) + '-byte budget'], ['Work per input', big(r.opsMedian) + ' operations', 'median, emulator count'], ['Time per input', '~' + r.msEstimate + ' ms', 'estimate at 240 MHz, not measured'], ['Real chip', 'not tested', 'CI1 pending hardware']]
    .map(([k, b, t]) => el('div', { class: 'card' }, el('div', { class: 'k' }, k), el('div', { class: 'big' }, b), el('p', { class: 'muted', style: 'font-size:13px' }, t))));
  $('faq-mem').textContent = 'On the emulator, the whole layer fits in ' + big(r.arena) + ' bytes of data, inside a ' + big(r.arenaMax) + '-byte budget, set aside once at boot. Code size is not measured.';
  $('faq-fault').textContent = 'It reports down, still delivers inputs that passed the signature check (marked unscreened), and reloads from its read-only copy. Here ' + big(f.caught) + ' of ' + big(f.injected) + ' injected faults were caught and it was back up for the next input on ' + big(f.backUp) + '.';
  $('faq-failed').textContent = failed.length ? failed.map((x) => x.id + ': ' + PLAIN[x.id] + ', measured ' + show(x, r) + '.').join(' ') + ' Each failure is kept on the record and on this page.' : 'Nothing measured on the emulator failed its bar. CI1, the real chip, is not tested.';
  const gl = (k) => { const g = GATES.find((x) => x.kernel === k); return g ? 'mutation gate ' + g.killed + '/' + g.total + ', ' + g.ignored + ' baselined' : 'pinned'; };
  $('parts').replaceChildren(...[['src/chip.mjs', 'chip-sim: the arena, the packed integer settle, the floor, the memory check and reload, the ring, evolution, sharing, fault injection.'], ['src/run.mjs', 'The experiments: learning on device A, the share to B, the held-out judgement, CI-EQ against Rung 1, the faults, every verdict.'], ['vendor/', 'Rungs 1, 3, 4 and 5 and the estate\'s keys, byte for byte.']]
    .map(([h, t]) => el('div', { class: 'card' }, el('div', { class: 'k' }, h), el('p', { style: 'font-size:14.5px;margin-top:4px' }, t), el('p', { class: 'vs', style: 'margin-top:6px;color:var(--accent)' }, gl(h)))));
  $('timeline').replaceChildren(...[['Seal 1', 'CLAIMS.md alone, every bar, CI1 marked not testable here.'], ['Learning', 'Device A on confirmed training attacks; the share to B (data/learned.json).'], ['Seal 2', 'The chip code, the learning record and the shapes by hash (SEAL2.md).'], ['Held-out, once', 'data/record.json.']].map(([a, b]) => el('li', {}, el('b', {}, a), ' · ', b)));
}
async function arena() {
  const t = await text('vendor/mesh-share/data/cell-after.txt'), p = t && H.parseCellText(t);
  if (!p) return;
  const lay = H.layout(p.M), regs = Object.entries(lay.regions), hue = ['--accent', '--win', '--tie', '--bad', '--muted'];
  $('arena').replaceChildren(...regs.map(([k, [, n]], j) => el('div', { title: k + ': ' + n + ' bytes', style: 'flex:' + n + ' 0 0;background:var(' + hue[j % hue.length] + ');opacity:' + (0.35 + 0.15 * (j % 4)) + ';min-width:2px' })), el('div', { title: 'unused', style: 'flex:' + (H.ARENA - lay.used) + ' 0 0;background:var(--panel)' }));
  $('regions').querySelector('tbody').replaceChildren(...regs.map(([k, [, n]]) => el('tr', {}, el('td', {}, el('code', {}, k)), el('td', {}, REGION[k] || k), el('td', { class: 'num' }, big(n)))), el('tr', {}, el('td', {}, el('b', {}, 'used')), el('td', {}, 'counted from the layout, in your tab'), el('td', { class: 'num' }, big(lay.used) + ' of ' + big(H.ARENA))));
}
let worker = null, seq = 0;
function ask(msg) { if (!worker) worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' }); return new Promise((resolve) => { const id = ++seq; const on = (e) => { if (e.data.id === id) { worker.removeEventListener('message', on); resolve(e.data); } }; worker.addEventListener('message', on); worker.postMessage({ ...msg, id }); }); }
$('t-go').onclick = async () => {
  $('t-go').disabled = true; $('t-status').textContent = 'booting the emulated chip (the first time downloads the MNIST files)…';
  const r = await ask({ do: 'one', kind: $('t-kind').value, i: $('t-i').value, fault: $('t-fault').checked, forge: $('t-forge').checked });
  $('t-go').disabled = false;
  if (!r.ok) { $('t-status').textContent = 'it did not run: ' + r.why; return; }
  $('t-status').textContent = 'emulator';
  $('t-out').querySelector('tbody').replaceChildren(...r.steps.map(([a, b]) => el('tr', {}, el('td', {}, el('b', {}, a)), el('td', {}, b))));
  $('t-out').hidden = false;
};
$('go').onclick = async () => {
  $('go').disabled = true; $('gostatus').textContent = 'screening 10,000 test digits, 1,500 held-out attacks and 200 faults on the emulated chip…';
  const r = await ask({ do: 'rerun' });
  $('go').disabled = false;
  if (!r.ok) { $('gostatus').textContent = 'it did not run: ' + r.why; return; }
  const a = r.record, b = REC.record, rows = [['test digits passing', a.genuinePass, b.genuinePass], ['scrambled rejected after learning', a.scrambled.after, b.scrambled.after], ['faults caught', a.faults.caught, b.faults.caught], ['bytes used', a.arena, b.arena], ['the hash of the record', a.hash, b.hash]];
  const tb = $('proof').querySelector('tbody'); tb.replaceChildren(); let all = true;
  for (const [w, x, y] of rows) { const same = x === y; all = all && same; tb.append(el('tr', {}, el('td', {}, w), el('td', { class: 'num' }, String(x).slice(0, 24)), el('td', { class: 'num' }, String(y).slice(0, 24)), el('td', { class: same ? 'ok' : 'no' }, same ? '✓ same' : '✗ differs'))); }
  $('proof').hidden = false;
  $('gostatus').textContent = (all ? '✓ your tab reproduced the record, hash and all' : '✗ your tab differs from the record') + ' · ' + (r.ms / 1000).toFixed(0) + ' s';
};
const gbp = (x) => '£' + Math.round(x).toLocaleString('en-GB');
function renderCost() {
  if (!BASIS) { $('c-head').textContent = 'The sourced basis did not load; reload the page.'; return; }
  const v = (id) => Number($(id).value);
  const r = mintCase(BASIS, { hoursPerWeek: v('c-hours'), share: v('c-share') / 100, seats: v('c-seats'), casesPerWeek: v('c-cases'), years: v('c-years') });
  if (!r.ok) { $('c-head').textContent = 'Check the inputs: ' + r.why + '.'; return; }
  const yrs = r.inputs.years + (r.inputs.years === 1 ? ' year' : ' years');
  $('c-overh').textContent = 'Over ' + yrs;
  $('c-head').textContent = `This process costs you ${gbp(r.perYear.today)} a year in staff time today. Owning it: ${gbp(r.perYear.own)} a year, which is ${gbp(r.savingPerYear)} a year back and ${gbp(r.savingOver)} over ${yrs}.`;
  const rows = [['Today', 'Your team does all of it.', 'today'], ['Rent AI assistant seats', `Microsoft 365 Copilot for ${r.inputs.seats} people (${gbp(r.lines.seats)} a year). It helps each person; the work, and the staff time, stay.`, 'rentSeats'],
    ['Call a cloud AI on every case', `Takes the same share off, billed per case at Claude Sonnet 5 API rates (${gbp(r.lines.api)} a year at your volume), and every case leaves your building.`, 'cloudApi'],
    ['Own it', `Takes the same share off on a machine you already have, for about ${gbp(r.lines.power)} a year of electricity. No seats, no meter, nothing leaves.`, 'own']];
  const tb = $('c-table').querySelector('tbody'); tb.replaceChildren();
  for (const [a, b, k] of rows) tb.append(el('tr', {}, el('td', {}, el('b', {}, a)), el('td', {}, b), el('td', { class: 'num' }, gbp(r.perYear[k])), el('td', { class: 'num' }, gbp(r.over[k]))));
  $('c-note').textContent = `Owning beats the cloud route by ${gbp(r.versusCloudOver)} over ${yrs} at this volume. Staff time is a floor: the UK median wage, with on-costs left out.`;
  $('c-board').textContent = `A defence layer that fits a small device, fails safe, and needs no cloud service behind it. It has not run on a real chip yet, and its self-improvement did not work, both stated on the record. For the work around it: today one process costs ${gbp(r.perYear.today)} a year in staff time. If owned systems take off the share you estimate, that is ${gbp(r.savingPerYear)} a year back, with nothing leaving the building, and the fee is due only on a receipt that it beat your current way on your own data.`;
}
async function main() {
  [REC, BASIS, LEARNED] = await Promise.all(['data/record.json', 'vendor/liveware/basis.json', 'data/learned.json'].map(json));
  GATES = (await Promise.all(['chip', 'run'].map((k) => json('receipts/gate-' + k + '.json')))).filter(Boolean);
  $('c-src').replaceChildren(...sourcesOf(BASIS || {}).map((s) => { const li = el('li', {}, s.what + (s.source ? ': ' : '')); if (s.source) { const a = el('a', { href: s.source, target: '_blank', rel: 'noopener' }); try { a.textContent = new URL(s.source).hostname; } catch { a.textContent = s.source; } li.append(a); } return li; }));
  for (const id of ['c-hours', 'c-share', 'c-seats', 'c-cases', 'c-years']) $(id).addEventListener('input', renderCost);
  renderCost();
  arena();
  if (!REC) { $('verdictline').textContent = 'The record did not load; reload the page.'; return; }
  fill();
}
main();
