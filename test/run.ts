// Save harness: npx tsx test/run.ts "<save.sav>" [--json out.json]
// Parses the save in Node, runs every analyzer and prints one line per circuit with its worst issues.
import * as fs from 'fs';
import * as path from 'path';
import { analyzeFile } from '../src/report/build';
import type { SaveReport } from '../src/report/types';
import gd from '../src/static/gamedata.json';

const [, , file, flag, out] = process.argv;
if (!file) { console.error('usage: tsx test/run.ts <save.sav> [--json out.json]'); process.exit(2); }
const buf = fs.readFileSync(file);
const r = analyzeFile({ kind: 'save', name: path.basename(file), data: new Uint8Array(buf).buffer }, gd as any) as SaveReport;
console.log(`${r.meta.session}: ${r.ms} ms`, r.counts);
console.log('live grid', r.live);
for (const c of r.cards) {
  const d = c.power.gen - c.power.draw;
  const n = (s: string) => c.issues.filter(i => i.sev === s).length;
  console.log(`${c.kind.padEnd(6)} P${c.priority ?? '-'} ${c.on === undefined ? '  ' : c.on ? 'ON ' : 'OFF'} ${(c.quadrant ?? '').padEnd(5)}${c.quadrantFromTag ? ' ' : '*'} ${c.name.padEnd(36)} ${(d >= 0 ? '+' : '') + d.toFixed(0)} MW (gen ${c.power.gen.toFixed(0)} / draw ${c.power.draw.toFixed(0)}) sloops ${c.sloops} ${c.severity.toUpperCase()} ${n('error')}E/${n('warn')}W belts ${c.belts.length} pipes ${c.pipes.length} parent=${c.parent}${c.nested.length ? ' nested=' + c.nested.map(x => x.name).join('|') : ''}`);
  for (const i of c.issues.filter(i => i.sev !== 'info').slice(0, 6)) console.log(`     ${i.sev} [${i.code}] ${i.msg}`);
}
if (flag === '--json') fs.writeFileSync(out, JSON.stringify(r, null, 1));
