// Checks src/app/lib/untar.ts against an archive made by the exporter's tar command.
// Usage: npx tsx test/untar.ts <archive.tar.gz> [blueprints folder to compare against]
import * as fs from 'fs';
import * as path from 'path';
import { untar } from '../src/app/lib/untar';

const [file, dir] = process.argv.slice(2);
const buf = fs.readFileSync(file);
const files = await untar(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const bySize = files.map(f => [(f as any)._rel as string, f.size] as const);
console.log(`${files.length} files, e.g.`, bySize.slice(0, 3));
let bad = 0;
if (dir) {
  const parent = path.dirname(dir);
  const mine = bySize.filter(([rel]) => rel.startsWith(path.basename(dir) + '/'));
  console.log(`${mine.length} of them in ${path.basename(dir)}/`);
  for (const [rel, size] of mine) {
    const disk = fs.readFileSync(path.join(parent, rel));
    const got = Buffer.from(await files.find(f => (f as any)._rel === rel)!.arrayBuffer());
    if (disk.length !== size || !disk.equals(got)) { bad++; console.log('MISMATCH', rel); }
  }
  const want = fs.readdirSync(dir).filter(f => /\.sbp(cfg)?$/i.test(f)).length;
  console.log(`${want} blueprint files on disk, ${bad} mismatches`);
}
process.exit(bad ? 1 : 0);
