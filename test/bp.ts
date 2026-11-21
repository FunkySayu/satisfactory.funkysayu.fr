// Blueprint harness: npx tsx test/bp.ts <blueprints dir> [name filter] [--json out]
import * as fs from 'fs';
import * as path from 'path';
import { analyzeFile } from '../src/report/build';
import type { BlueprintReport } from '../src/report/types';
import gd from '../src/static/gamedata.json';

const dir = process.argv[2];
if (!dir) { console.error('usage: tsx test/bp.ts <blueprints dir> [name filter] [--json out]'); process.exit(2); }
const filt = process.argv[3] && !process.argv[3].startsWith('--') ? new RegExp(process.argv[3], 'i') : null;
const ji = process.argv.indexOf('--json'); const out: BlueprintReport[] = [];
const ab = (p: string) => new Uint8Array(fs.readFileSync(p)).buffer;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sbp'))) {
  const name = f.slice(0, -4); if (filt && !filt.test(name)) continue;
  const s = analyzeFile({ kind: 'blueprint', name, sbp: ab(path.join(dir, f)), sbpcfg: ab(path.join(dir, `${name}.sbpcfg`)) }, gd as any) as BlueprintReport;
  out.push(s);
  console.log(`\n## ${name} [${s.severity}] power ${s.power.draw} MW x1 (gen ${s.power.gen}) · ${s.power.machines} powered, ${s.power.nets} power nets, ${s.power.unwired} unwired`);
  console.log('  IO', s.io.filter(x => Math.abs(x.out - x.inp) > 0.01).map(x => `${x.name} ${x.out - x.inp > 0 ? '+' : ''}${(x.out - x.inp).toFixed(1)}`).join(' · '));
  console.log('  ports', s.ports.filter(p => Object.keys(p.flow).length).map(p => `${p.kind}@${p.on}:${JSON.stringify(p.flow)}`).join(' '), `(${s.ports.length} open)`);
  for (const i of s.issues) console.log(`  ${i.sev} [${i.code}] ${i.msg}`);
}
if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(out));
