// Blueprint summary: what it needs and gives per minute with every machine at its clock, its machines, the open ports
// the belt solver routes items through, and its power (at a x1 power cost: the page scales it).
import { cls, clockOf, push, round, xyz, type ObjectIndex, type SaveObject } from './objects';
import type { GameData, Names } from './gamedata';
import type { Flows } from './flows';
import type { Logistics } from './logistics';
import type { Networks } from './networks';
import type { PowerGrid } from './power';

export interface BlueprintIO { item: string; name: string; inp: number; out: number }
export interface BlueprintRow { b: string; c: string; r: string; n: number; clk: number; mw: number; gen: number; io: Record<string, number> }
export interface BlueprintPort { kind: 'in' | 'out' | 'io'; fluid: boolean; on: string; at: number[]; flow: Record<string, number> }
export interface BlueprintPower { draw: number; gen: number; machines: number; nets: number; unwired: number }
export interface BlueprintInfo {
  name: string; desc: string;
  /** Designer size in foundations (4 = Mk.1 designer). */
  dims: number[];
  io: BlueprintIO[];
  rows: BlueprintRow[];
  ports: BlueprintPort[];
  power: BlueprintPower;
  /** Powered machines grouped by power network, biggest first. */
  powerGroups: SaveObject[][];
  /** Powered machines without a wire. */
  unwired: SaveObject[];
}

export function buildBlueprintInfo(header: { name: string; desc: string; dims: number[] }, idx: ObjectIndex, gd: GameData, names: Names,
  flows: Flows, lg: Logistics, power: PowerGrid, nets: Networks): BlueprintInfo {
  const pm = power.machines.filter(b => power.powered(b));
  const comps = new Map<string, SaveObject[]>(); const unwired: SaveObject[] = [];
  for (const b of pm) { if (!power.wired.has(b.instanceName)) unwired.push(b); else push(comps, power.segOf(b.instanceName), b); }
  const powerGroups = [...comps.values()].sort((a, b) => b.length - a.length);
  // I/O at 100% of each machine's clock
  const io = new Map<string, { inp: number; out: number }>();
  const rows = new Map<string, BlueprintRow>();
  let draw = 0, gen = 0;
  for (const o of idx.objects) {
    if (!/^Build_/.test(cls(o)) || o.virtual) continue;
    const f = flows.of(o); const isP = power.pinfo.has(o.instanceName) && power.powered(o);
    if (!isP && !Object.keys(f.inp).length && !Object.keys(f.out).length) continue;
    if (f.unknown || f.unlimited) continue;
    for (const [i, r] of Object.entries(f.inp)) { const x = io.get(i) ?? io.set(i, { inp: 0, out: 0 }).get(i)!; x.inp += r; }
    for (const [i, r] of Object.entries(f.out)) { const x = io.get(i) ?? io.set(i, { inp: 0, out: 0 }).get(i)!; x.out += r; }
    const mw = power.isGen(o) ? 0 : power.nominalDraw(o); const pg = power.isGen(o) ? (gd.buildings[cls(o)]?.pg ?? 0) * clockOf(o) : 0;
    draw += mw; gen += pg;
    const key = `${names.building(o)}|${names.recipe(o)}`;
    const row = rows.get(key) ?? rows.set(key, { b: names.building(o), c: cls(o), r: names.recipe(o), n: 0, clk: 0, mw: 0, gen: 0, io: {} }).get(key)!;
    row.n++; row.clk += clockOf(o); row.mw += mw; row.gen += pg;
    for (const [i, r] of Object.entries(f.inp)) row.io[i] = (row.io[i] || 0) - r;
    for (const [i, r] of Object.entries(f.out)) row.io[i] = (row.io[i] || 0) + r;
  }
  return {
    ...header,
    io: [...io].map(([i, x]) => ({ item: i, name: names.item(i), inp: round(x.inp), out: round(x.out) })).sort((a, b) => (a.out - a.inp) - (b.out - b.inp)),
    rows: [...rows.values()].map(r => ({ ...r, clk: round(r.clk / r.n), mw: round(r.mw), gen: round(r.gen), io: Object.fromEntries(Object.entries(r.io).map(([i, v]) => [i, round(v)])) })).sort((a, b) => b.mw - a.mw),
    ports: lg.virtuals.map(v => ({
      kind: v.virtual!, fluid: !!v.fluid, on: names.building(v.on!), at: xyz(v),
      flow: Object.fromEntries(Object.entries(nets.boundaryFlow.get(v.instanceName) || {}).map(([i, r]) => [i, round(r)])),
    })).sort((a, b) => Object.keys(b.flow).length - Object.keys(a.flow).length),
    power: { draw: round(draw), gen: round(gen), machines: pm.length, nets: comps.size, unwired: unwired.length },
    powerGroups, unwired,
  };
}
