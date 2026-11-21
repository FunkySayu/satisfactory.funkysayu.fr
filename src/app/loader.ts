// Loading: local files and URLs go through the web worker; loads run one after the other so two of them never
// fight over the progress bar. Live reload HEADs each URL every second and reloads what changed.
import type { WorkerMessage, WorkerRequest } from '../report/worker';
import type { BlueprintReport, Snapshot } from '../report/types';
import { getState, go, setState } from './store';
import { isBlueprintFile, pairBlueprints } from './lib/files';
import { untar } from './lib/untar';
import { plural } from './lib/format';
import { BP_URL, hostOf, LIVE_RELOAD, SAVE_URL, SNAPSHOT_URL } from './lib/params';

const setLoading = (p: number | null, msg = '') => setState({ loading: p === null ? null : { p, msg } });
const showError = (error: string) => setState({ error });

let queue: Promise<unknown> = Promise.resolve();
const enqueue = (f: () => Promise<unknown>) => (queue = queue.then(f, f));

/** Resolves once the worker is done (or failed). p0 = progress already shown (download). */
function runWorker(msg: WorkerRequest, transfer: Transferable[], p0: number): Promise<WorkerMessage | null> {
  return new Promise(res => {
    const w = new Worker(new URL('../report/worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const m = ev.data;
      if (m.type === 'progress') { setLoading(p0 + m.p * (1 - p0), m.msg); return; }
      w.terminate(); setLoading(null); res(m);
    };
    w.onerror = e => { w.terminate(); setLoading(null); showError(`The parser crashed: ${e.message}`); res(null); };
    w.postMessage(msg, transfer);
  });
}

async function analyzeSave(name: string, buf: ArrayBuffer, p0 = 0) {
  setLoading(p0, `Reading ${name}`);
  const m = await runWorker({ kind: 'save', name, buf }, [buf], p0);
  if (m?.type === 'save') setState(s => ({ report: m.report, view: s.view === 'blueprints' && !s.blueprints.length ? 'switches' : s.view, modal: null }));
  else if (m?.type === 'error') showError(`This file could not be read as a Satisfactory save (${m.message}). Pick a .sav file from your SaveGames folder.`);
}

/** Pairs .sbp / .sbpcfg files and checks them all. quiet = from ?bp_url=: stay on the current tab, keep the open blueprint open. */
async function analyzeBlueprints(files: File[], quiet = false) {
  setState({ error: null });
  const { ready, lonely } = pairBlueprints(files);
  if (!ready.length) {
    showError(files.length ? `No blueprint found: pick the folder that holds the .sbp and .sbpcfg files (both are needed${lonely.length ? `; ${lonely.slice(0, 3).join(', ')} has only one of the two` : ''}).` : 'No file selected.');
    return;
  }
  setLoading(0, `Reading ${plural(ready.length, 'blueprint')}`);
  const bufs = await Promise.all(ready.map(async g => ({ name: g.name, folder: g.folder, sbp: await g.sbp.arrayBuffer(), cfg: await g.cfg.arrayBuffer() })));
  const { open, blueprints: before } = getState();
  const wasOpen = open?.startsWith('bp:') ? before[+open.slice(3)] : undefined;
  const m = await runWorker({ kind: 'blueprints', files: bufs }, bufs.flatMap(b => [b.sbp, b.cfg]), 0);
  if (m?.type === 'error') { showError(`The blueprints could not be read (${m.message}).`); return; }
  if (m?.type !== 'blueprints') return;
  const list = [...m.list].sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (lonely.length) showError(`Skipped ${plural(lonely.length, 'file')} without its pair (.sbp + .sbpcfg): ${lonely.slice(0, 5).join(', ')}${lonely.length > 5 ? '…' : ''}`);
  if (quiet) {
    const i = wasOpen ? list.findIndex(b => b.folder === wasOpen.folder && b.name === wasOpen.name) : -1;
    setState({ blueprints: list, open: wasOpen ? (i >= 0 ? `bp:${i}` : null) : getState().open });
    return;
  }
  setState({ blueprints: list, open: null, modal: null });
  go('blueprints');
}

/** Files picked or dropped: blueprints when there are any, else the first save. */
export function loadFiles(files: File[]) {
  if (!files.length) return;
  setState({ error: null });
  if (files.some(isBlueprintFile)) return enqueue(() => analyzeBlueprints(files));
  const f = files.find(x => /\.sav$/i.test(x.name)) ?? files[0];
  return enqueue(async () => analyzeSave(f.name, await f.arrayBuffer()));
}

// ---------------------------------------------------------------- URLs
interface Remote { what: string; url: string; load: (buf: ArrayBuffer, name: string, quiet: boolean) => Promise<void>; version: string | null; busy: boolean; checked: number; fail: string }
const remotes: Remote[] = [];
/** ETag is only readable when the server exposes it to CORS; Last-Modified and Content-Length always are. */
const versionOf = (r: Response) => [r.headers.get('etag'), r.headers.get('last-modified'), r.headers.get('content-length')].map(x => x ?? '').join('|');
const publishRemotes = () => setState({ remotes: remotes.map(({ what, url, checked, fail }) => ({ what, url, checked, fail })) });

async function download(url: string, what: string, quiet: boolean) {
  const host = hostOf(url);
  setLoading(0, `${quiet ? `The ${what} changed, downloading again` : `Downloading the ${what}`} from ${host}`);
  const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const total = +(r.headers.get('content-length') || 0); const parts: Uint8Array[] = []; let got = 0;
  const rd = r.body?.getReader();
  if (!rd) return { r, buf: await r.arrayBuffer() };
  for (;;) {
    const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length;
    setLoading(total ? 0.15 * got / total : 0.05, `Downloading the ${what} from ${host} (${(got / 1048576).toFixed(1)} MB)`);
  }
  const b = new Uint8Array(got); let o = 0; for (const p of parts) { b.set(p, o); o += p.length; }
  return { r, buf: b.buffer };
}

/** quiet = a live reload: keep the board on screen, show only the progress bar. */
function loadRemote(src: Remote, quiet = false) {
  src.busy = true;
  return enqueue(async () => {
    if (!quiet) setState({ error: null });
    try {
      const { r, buf } = await download(src.url, src.what, quiet);
      src.version = versionOf(r);
      await src.load(buf, decodeURIComponent(new URL(r.url || src.url).pathname.split('/').pop() || ''), quiet);
    } catch (e: any) {
      setLoading(null);
      if (quiet) src.fail = e?.message || String(e);
      else showError(`The ${src.what} at ${src.url} could not be downloaded (${e?.message || e}). The server has to allow this page in its CORS headers (Access-Control-Allow-Origin), or you can drop the files here instead.`);
    }
    src.busy = false; publishRemotes();
  });
}

async function checkRemote(src: Remote) {
  if (src.busy || document.hidden) return;
  src.busy = true;
  try {
    const r = await fetch(src.url, { method: 'HEAD', cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const v = versionOf(r); src.checked = Date.now(); src.fail = '';
    if (v === '||') src.fail = 'the server sends no ETag, Last-Modified or Content-Length to compare';
    else if (src.version === null) src.version = v;
    else if (v !== src.version) { loadRemote(src, true); return; }
  } catch (e: any) { src.fail = e?.message || String(e); }
  src.busy = false; publishRemotes();
}

async function loadSnapshot(url: string) {
  try {
    setLoading(0.5, `Downloading the report from ${hostOf(url)}`);
    const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d: Snapshot = await r.json();
    setState({ report: d.report ?? null, blueprints: (d.blueprints ?? []) as BlueprintReport[] });
    if (!location.hash && d.view) go(d.view);
  } catch (e: any) { showError(`The report at ${url} could not be loaded (${e?.message || e}).`); }
  setLoading(null);
}

/** Loads what the page parameters point at; starts live reload when asked. */
export function boot() {
  fetch(`${import.meta.env.BASE_URL}icons/index.json`).then(r => r.ok ? r.json() : []).then((l: string[]) => setState({ icons: new Set(l) })).catch(() => {});
  const snap = SNAPSHOT_URL; if (snap) enqueue(() => loadSnapshot(snap));
  const remote = (url: string, what: string, load: Remote['load']): Remote => ({ url, what, load, version: null, busy: false, checked: 0, fail: '' });
  if (SAVE_URL) remotes.push(remote(SAVE_URL, 'save', (buf, name) => analyzeSave(name || 'save.sav', buf, 0.15)));
  if (BP_URL) remotes.push(remote(BP_URL, 'blueprints', async buf => analyzeBlueprints(await untar(buf), true)));
  for (const src of remotes) loadRemote(src);
  publishRemotes();
  if (LIVE_RELOAD && remotes.length) {
    setState({ live: true });
    setInterval(() => { for (const src of remotes) checkRemote(src); }, 1000);
  }
}

