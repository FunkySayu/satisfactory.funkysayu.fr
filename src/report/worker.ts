/// <reference lib="webworker" />
// Web worker: parses a save (or a set of blueprints), runs the analyzers and posts the report back.
import type { GameData } from '../model/satisfactory_save';
import { analyzeFile, failedBlueprint } from './build';
import type { BlueprintReport, SaveReport } from './types';

export type WorkerRequest =
  | { kind: 'save'; name: string; buf: ArrayBuffer }
  | { kind: 'blueprints'; files: { name: string; folder: string; sbp: ArrayBuffer; cfg: ArrayBuffer }[] };
export type WorkerMessage =
  | { type: 'progress'; p: number; msg: string }
  | { type: 'save'; report: SaveReport }
  | { type: 'blueprints'; list: BlueprintReport[] }
  | { type: 'error'; message: string };

declare const self: DedicatedWorkerGlobalScope;
const post = (m: WorkerMessage) => self.postMessage(m);

// served by nginx next to the page (src/static/gamedata.json)
let gameData: Promise<GameData> | null = null;
const loadGameData = () => gameData ??= fetch(new URL(`${import.meta.env.BASE_URL}gamedata.json`, self.location.origin)).then(r => {
  if (!r.ok) throw new Error(`game data: HTTP ${r.status}`); return r.json();
});

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const m = ev.data;
  try {
    const gd = await loadGameData();
    if (m.kind === 'blueprints') {
      const list = m.files.map((f, i) => {
        post({ type: 'progress', p: i / m.files.length, msg: `Checking ${f.name} (${i + 1} of ${m.files.length})` });
        try { return { ...(analyzeFile({ kind: 'blueprint', name: f.name, sbp: f.sbp, sbpcfg: f.cfg }, gd) as BlueprintReport), folder: f.folder }; }
        catch (e: any) { return failedBlueprint(f.name, f.folder, e?.message || String(e)); }
      });
      post({ type: 'blueprints', list });
      return;
    }
    const report = analyzeFile({ kind: 'save', name: m.name, data: m.buf }, gd, { onProgress: (p, msg) => post({ type: 'progress', p: p * 0.95, msg }) }) as SaveReport;
    post({ type: 'save', report });
  } catch (e: any) {
    post({ type: 'error', message: e?.message || String(e) });
  }
};
