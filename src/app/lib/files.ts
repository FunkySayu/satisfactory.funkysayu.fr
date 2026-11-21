// Files picked, dropped or downloaded: pair blueprint files, walk dropped folders.

/** Path of a file inside the folder it came from (dropped folder, folder picker or tar archive). */
export const relPath = (f: File): string => (f as any)._rel || (f as any).webkitRelativePath || f.name;
export const withRelPath = (f: File, rel: string) => { Object.defineProperty(f, '_rel', { value: rel }); return f; };

export interface BlueprintFiles { name: string; folder: string; sbp: File; cfg: File }

/** Pairs each .sbp with its .sbpcfg (same folder, same name). lonely = names with only one of the two. */
export function pairBlueprints(files: File[]): { ready: BlueprintFiles[]; lonely: string[] } {
  const groups = new Map<string, { name: string; folder: string; sbp?: File; cfg?: File }>();
  for (const f of files) {
    const m = f.name.match(/^(.*)\.(sbp|sbpcfg)$/i); if (!m) continue;
    const rel = relPath(f);
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const k = `${dir}/${m[1]}`; const g = groups.get(k) ?? groups.set(k, { name: m[1], folder: dir.split('/').pop() || '' }).get(k)!;
    if (m[2].toLowerCase() === 'sbp') g.sbp = f; else g.cfg = f;
  }
  const all = [...groups.values()];
  return {
    ready: all.filter((g): g is BlueprintFiles => !!g.sbp && !!g.cfg),
    lonely: all.filter(g => !g.sbp || !g.cfg).map(g => g.name),
  };
}

/** Files dropped on the page, folders included (read through the entries API). */
export async function droppedFiles(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map(i => (i as any).webkitGetAsEntry?.()); const files = [...dt.files];
  if (!entries.some(e => e?.isDirectory)) return files;
  const out: File[] = [];
  const walk = async (e: any, path: string): Promise<void> => {
    if (e.isFile) { const f: File = await new Promise((res, rej) => e.file(res, rej)); out.push(withRelPath(f, path + f.name)); }
    else if (e.isDirectory) {
      const r = e.createReader();
      for (;;) { const batch: any[] = await new Promise((res, rej) => r.readEntries(res, rej)); if (!batch.length) break; for (const c of batch) await walk(c, `${path}${e.name}/`); }
    }
  };
  for (const e of entries) if (e) await walk(e, '');
  return out;
}

export const isBlueprintFile = (f: File) => /\.sbp(cfg)?$/i.test(f.name);
