#!/usr/bin/env node
// tools/gate-receipt.mjs — receipts/gate-<name>.json from a witness verdict: one kernel's mutation gate, as the page shows it.
// node tools/gate-receipt.mjs <name> <kernel> <witness-log>          → writes receipts/gate-<name>.json
// node tools/gate-receipt.mjs <name> <kernel> <witness-log> --check  → CI: the committed receipt must equal this run's verdict
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [name, kernel, logPath] = process.argv.slice(2);
if (!name || !kernel || !logPath) { console.error('usage: gate-receipt.mjs <name> <kernel> <witness-log> [--check]'); process.exit(2); }
const log = readFileSync(logPath, 'utf8');
const j = JSON.parse(log.slice(log.indexOf('{'), log.lastIndexOf('}') + 1));
const out = { kernel, witness: 'v0.6', total: j.total, killed: j.killed, survived: j.survived.length, ignored: j.ignored.length, clean: j.clean === true };
const text = JSON.stringify(out, null, 1) + '\n';
const at = new URL('../receipts/gate-' + name + '.json', import.meta.url);
if (process.argv.includes('--check')) {
  const want = readFileSync(at, 'utf8');
  if (want !== text) { console.error('GATE RECEIPT DIFFERS for ' + kernel + '\nwant ' + want + 'got  ' + text); process.exit(1); }
  console.log('gate receipt holds for ' + kernel + ': ' + out.killed + '/' + out.total + ', ' + out.ignored + ' baselined');
} else { mkdirSync(new URL('../receipts/', import.meta.url), { recursive: true }); writeFileSync(at, text); console.log(text); }
