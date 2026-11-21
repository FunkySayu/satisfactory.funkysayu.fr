// What each building produces and consumes per minute (items/min, m³/min for fluids), at its clock.
import { cls, clockOf, leaf, num, ref, type ObjectIndex, type SaveObject } from './objects';
import type { GameData } from './gamedata';
import { BUFFER, EXTERNAL, UNLIMITED_SINKS, isInName, isOutName, type Logistics, type Port } from './logistics';

export interface MachineFlow {
  out: Record<string, number>;
  inp: Record<string, number>;
  /** Rates unknown: station, buffer, unresolved recipe, miner without node. */
  unknown?: boolean;
  /** Takes any amount (sink, depot, storage at the end of a line, blueprint output). */
  unlimited?: boolean;
  /** Blueprint input: supplies whatever the machines inside do not produce. */
  boundary?: boolean;
}

export class Flows {
  private cache = new Map<string, MachineFlow>();
  constructor(private idx: ObjectIndex, private gd: GameData, private lg: Logistics) {}

  isFluid(i: string) { return !!this.gd.items[i]?.f; }
  /** Only the solid (fluid = false) or fluid entries of a rate map. */
  pick(r: Record<string, number>, fluid: boolean) { return Object.fromEntries(Object.entries(r).filter(([i]) => this.isFluid(i) === fluid)); }

  of(o: SaveObject): MachineFlow {
    const k = o.instanceName; const c = this.cache.get(k); if (c) return c;
    const gd = this.gd;
    const f: MachineFlow = { out: {}, inp: {} }; const C = cls(o); const clock = clockOf(o);
    const node = () => { const p = ref(o, 'mExtractableResource'); return p ? gd.nodes[leaf(p)] : undefined; };
    let m: RegExpMatchArray | null;
    if (o.virtual) { f.boundary = o.virtual !== 'out'; f.unlimited = o.virtual !== 'in'; }
    else if ((m = C.match(/^Build_MinerMk(\d)_C$/))) {
      const n = node(); if (n) f.out[n[0]] = [0, 60, 120, 240][+m[1]] * n[1] * clock; else f.unknown = true;
    } else if (C === 'Build_WaterPump_C') f.out['Desc_Water_C'] = 120 * clock;
    else if (C === 'Build_OilPump_C') { const n = node(); if (n) f.out[n[0]] = 120 * n[1] * clock; else f.unknown = true; }
    else if (C === 'Build_FrackingExtractor_C') { const n = node(); if (n) f.out[n[0]] = 60 * n[1] * clock; else f.unknown = true; }
    else if (UNLIMITED_SINKS.test(C)) f.unlimited = true;
    else if (/^Build_StorageContainerMk\d_C$/.test(C) && !(this.lg.bOut.get(k)?.size)) f.unlimited = true; // storage at the end of a line
    else if (EXTERNAL.test(C) || BUFFER.test(C)) f.unknown = true;
    else if (o.properties && 'mCurrentRecipe' in o.properties) {
      const r = gd.recipes[leaf(ref(o, 'mCurrentRecipe') || '')];
      if (r) {
        const boost = num(o, 'mCurrentProductionBoost', 1); const per = 60 / r.d * clock;
        for (const [i, n] of Object.entries(r.o)) f.out[i] = n * per * boost;
        for (const [i, n] of Object.entries(r.i)) f.inp[i] = n * per;
      } else if (ref(o, 'mCurrentRecipe')) f.unknown = true;
    } else if (gd.buildings[C]?.pg && gd.buildings[C]?.fuels) {
      const b = gd.buildings[C]; const fuel = leaf(ref(o, 'mCurrentFuelClass') || b.fuels![0]);
      // fluid energy values are per litre, pipe rates per m³
      const e = gd.items[fuel]?.e; if (e) f.inp[fuel] = b.pg! * clock / (gd.items[fuel].f ? e * 1000 : e) * 60;
      if (C === 'Build_GeneratorCoal_C') f.inp['Desc_Water_C'] = 45 * clock;
      if (C === 'Build_GeneratorNuclear_C') f.inp['Desc_Water_C'] = 240 * clock;
    }
    this.cache.set(k, f); return f;
  }

  /** Is this machine port an input / output? Pipe ports: by the fluids the recipe uses, by name when it has both. */
  portIs(t: string, p: Port, fluid: boolean, dir: 'in' | 'out') {
    if (!fluid) return dir === 'in' ? isInName(p.name) : isOutName(p.name);
    const f = this.of(this.idx.at(t));
    const hasIn = Object.keys(this.pick(f.inp, true)).length > 0, hasOut = Object.keys(this.pick(f.out, true)).length > 0;
    return dir === 'in' ? hasIn && (!hasOut || !/Output/i.test(p.name)) : hasOut && (!hasIn || !/Input/i.test(p.name));
  }
  /** Does the machine have an unconnected port in this direction? */
  openPort(t: string, fluid: boolean, dir: 'in' | 'out') { return this.lg.ports(t, fluid).some(p => !p.to && this.portIs(t, p, fluid, dir)); }
  /** Does the machine have a connected port in this direction? */
  connectedPort(t: string, fluid: boolean, dir: 'in' | 'out') { return this.lg.ports(t, fluid).some(p => p.to && this.portIs(t, p, fluid, dir)); }
}
