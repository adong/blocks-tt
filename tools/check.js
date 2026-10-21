#!/usr/bin/env node
/* TT Blocks: run the whole check headlessly (no browser, no npm).
     node tools/check.js                  the check (must pass), then every sabotage case (each must be caught)
     node tools/check.js --sabotage meshDrop   one sabotage case, with its failures listed
     node tools/check.js --only=mesh,save      only the groups whose names start with these
   Exit code 0 only if the real check passes and every sabotage case is caught. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
const dir = path.join(__dirname, '..', 'js');
// the rules only: no Three.js, no page
const FILES = ['title.js', 'core.js', 'blocks.js', 'world.js', 'mesher.js', 'quests.js', 'build.js', 'player.js', 'animals.js', 'save.js', 'session.js', 'check.js'];
for (const f of FILES) vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const sabIx = args.indexOf('--sabotage');
const only = opt('only', '') ? opt('only').split(',') : null;

function show(r, n = 12) {
  for (const f of r.fails.slice(0, n)) console.log('   ', f);
  if (r.fails.length > n) console.log(`    … and ${r.fails.length - n} more`);
}

if (sabIx >= 0) {
  const r = BT.check({ sabotage: args[sabIx + 1], only });
  console.log(r.ok ? `sabotage ${r.sabotage}: NOT caught` : `sabotage ${r.sabotage}: caught`);
  show(r);
  process.exit(r.ok ? 1 : 0);
}

const t0 = Date.now();
const r = BT.check({ only });
for (const g of r.groups) {
  console.log(`${g.ok ? 'ok  ' : 'FAIL'} ${g.name}${g.notes.length ? '  (' + g.notes.join('; ') + ')' : ''}`);
  if (!g.ok) show(g);
}
console.log(r.ok ? `\nthe check passes (${((Date.now() - t0) / 1000).toFixed(1)} s)` : `\nthe check FAILS: ${r.fails.length} problems`);
if (!r.ok || only) process.exit(r.ok ? 0 : 1);

// every sabotage must make the check fail
let missed = 0;
for (const [name, what] of Object.entries(BT.check.SABOTAGE)) {
  const s = BT.check({ sabotage: name });
  if (s.ok) missed++;
  console.log(`${s.ok ? 'NOT caught' : 'caught    '} sabotage ${name} (${what})${s.ok ? '' : ': ' + s.fails[0]}`);
}
console.log(missed ? `\n${missed} sabotage cases NOT caught` : '\nevery sabotage case is caught');
process.exit(missed ? 1 : 0);
