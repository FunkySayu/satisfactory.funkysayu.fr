// The model's only entry point: parse a save (.sav) or a blueprint (.sbp + .sbpcfg) and model it.
// Everything downstream (analyzers, report, scripts) imports from this file.
import { Parser } from '@etothepii/satisfactory-file-parser';
import { ObjectIndex, type SaveObject } from './objects';
import { Names, type GameData } from './gamedata';
import { Logistics } from './logistics';
import { Flows } from './flows';
import { PowerGrid, type PowerSum } from './power';
import { Buildings } from './buildings';
import { Networks } from './networks';
import { buildCircuits, type Circuit, type MachineRow, type SloopCount, type StoredItem } from './circuits';
import { buildBlueprintInfo, type BlueprintInfo } from './blueprint';

export type SaveInput =
  | { kind: 'save'; name: string; data: ArrayBuffer }
  | { kind: 'blueprint'; name: string; sbp: ArrayBuffer; sbpcfg: ArrayBuffer };

export interface ParseOptions {
  /** p from 0 to 1. */
  onProgress?: (p: number, msg: string) => void;
}

/** Save header. */
export interface SaveMeta { file: string; session: string; savedAt: string | null; playHours: number | null; build: string | null }

export interface SatisfactorySave {
  kind: 'save' | 'blueprint';
  /** Saves only. */
  meta: SaveMeta | null;
  /** Blueprints only. */
  blueprint: BlueprintInfo | null;
  gameData: GameData;
  /** Every object, including the virtual blueprint ports. */
  index: ObjectIndex;
  names: Names;
  buildings: Buildings;
  logistics: Logistics;
  flows: Flows;
  power: PowerGrid;
  networks: Networks;
  circuits: Circuit[];
  /** Every powered building. */
  machines: MachineRow[];
  /** Main grid plus every switch that is on. */
  live: PowerSum;
  sloops: SloopCount;
  depotStored: StoredItem[];
  counts: Record<string, number>;
  /** Time spent reading the file and building the model. */
  ms: { parse: number; model: number };
}

const ticksToIso = (t: unknown): string | null => {
  // 1.x saves store Unix milliseconds; older ones stored .NET ticks
  try { const n = BigInt(String(t)); if (n <= 0n) return null; return new Date(Number(n > 10n ** 15n ? (n - 621355968000000000n) / 10000n : n)).toISOString(); } catch { return null; }
};

export function parseSatisfactorySave(input: SaveInput, gameData: GameData, opts: ParseOptions = {}): SatisfactorySave {
  const t0 = Date.now();
  let objects: SaveObject[]; let meta: SaveMeta | null = null; let bpHeader: { name: string; desc: string; dims: number[] } | null = null;
  if (input.kind === 'save') {
    opts.onProgress?.(0, 'Decompressing save');
    const save: any = Parser.ParseSave(input.name, input.data, { onProgressCallback: (p: number, msg?: string) => opts.onProgress?.(p * 0.95, msg || 'Reading objects') });
    objects = [];
    for (const lvl of Object.values(save.levels) as any[]) for (const o of lvl.objects) objects.push(o);
    const h: any = save.header || {};
    meta = {
      file: h.saveName ? `${h.saveName}.sav` : input.name, session: h.sessionName || input.name.replace(/\.sav$/i, ''), savedAt: ticksToIso(h.saveDateTime),
      playHours: typeof h.playDurationSeconds === 'number' ? h.playDurationSeconds / 3600 : null, build: h.buildVersion != null ? String(h.buildVersion) : null,
    };
  } else {
    const bp: any = Parser.ParseBlueprintFiles(input.name, input.sbp, input.sbpcfg);
    objects = bp.objects;
    const d = bp.header?.designerDimension;
    bpHeader = { name: input.name, desc: bp.config?.description || '', dims: d ? [d.x, d.y, d.z] : [] };
  }
  const t1 = Date.now();
  opts.onProgress?.(0.95, `Modelling ${objects.length.toLocaleString('en-US')} objects`);
  const isBp = input.kind === 'blueprint';
  const index = new ObjectIndex(objects);
  const names = new Names(gameData);
  const logistics = new Logistics(index, isBp);
  const flows = new Flows(index, gameData, logistics);
  const power = new PowerGrid(index, gameData);
  const buildings = new Buildings(index, names, power, isBp);
  const networks = new Networks(index, logistics, flows, names, power, isBp);
  const { circuits, machines, sloops, depotStored, live } = buildCircuits(index, names, power, buildings, networks);
  const blueprint = bpHeader ? buildBlueprintInfo(bpHeader, index, gameData, names, flows, logistics, power, networks) : null;
  const counts = { objects: objects.length, switches: power.switches.length, beltNets: networks.belts.length, pipeNets: networks.pipes.length, machines: power.machines.length };
  opts.onProgress?.(1, 'Model ready');
  return {
    kind: input.kind, meta, blueprint, gameData, index, names, buildings, logistics, flows, power, networks,
    circuits, machines, live, sloops, depotStored, counts, ms: { parse: t1 - t0, model: Date.now() - t1 },
  };
}

// ---------------------------------------------------------------- re-exports for downstream code
export type { GameData } from './gamedata';
export { purityName } from './gamedata';
export type { SaveObject } from './objects';
export { cls, clockOf, fmt, leaf, num, owner, prop, ref, round, sid, tol, xyz } from './objects';
export type { Port } from './logistics';
export { BUFFER, isInName, isOutName } from './logistics';
export type { MachineFlow } from './flows';
export type { PowerSum } from './power';
export { emptyPower } from './power';
export type { Network, NetKind, ItemSolution, NetSummary, HeadLift } from './networks';
export type { NetGraph, GNode, GEdge, GKind, NetSeverity } from './diagram';
export type { Circuit, MachineRow, DepotFlow, SloopCount, StoredItem } from './circuits';
export type { BlueprintInfo, BlueprintIO, BlueprintRow, BlueprintPort, BlueprintPower } from './blueprint';
