// Reads a .tar (gzipped or not) in the browser: what the exporter uploads for ?bp_url=.
/** Files of a .tar (gzipped or not): ustar, GNU long names and pax paths. Each File carries its path in _rel, like a dropped folder. */
export async function untar(buf: ArrayBuffer): Promise<File[]> {
  let b = new Uint8Array(buf);
  if (b[0] === 0x1f && b[1] === 0x8b) b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const td = new TextDecoder(); const files: File[] = [];
  const str = (x: Uint8Array) => { const z = x.indexOf(0); return td.decode(z < 0 ? x : x.subarray(0, z)); };
  let next: string | null = null;
  for (let o = 0; o + 512 <= b.length;) {
    const h = b.subarray(o, o + 512); if (h.every(x => x === 0)) break;
    const size = parseInt(str(h.subarray(124, 136)).trim() || '0', 8); const type = String.fromCharCode(h[156] || 48);
    const data = b.subarray(o + 512, o + 512 + size); o += 512 + Math.ceil(size / 512) * 512;
    if (type === 'L') { next = str(data); continue; }
    if (type === 'x') { const m = td.decode(data).match(/(?:^|\n)\d+ path=([^\n]*)\n/); if (m) next = m[1]; continue; }
    const prefix = str(h.subarray(257, 263)).startsWith('ustar') ? str(h.subarray(345, 500)) : '';
    const path = next ?? (prefix ? `${prefix}/` : '') + str(h.subarray(0, 100)); next = null;
    if (type !== '0') continue;
    const f = new File([data.slice()], path.split('/').pop()!); (f as any)._rel = path.replace(/^\.\//, ''); files.push(f);
  }
  return files;
}
