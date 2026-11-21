// Circuits as the player sees them: one per priority switch (what is behind it), the main grid, and separate grids.
// Each has its power (now and at full load), machines, somersloops, augmenters and dimensional depot uploads.
import { cls, clockOf, leaf, prop, round, sid, val, xyz, type ObjectIndex, type SaveObject } from './objects';
import type { Names } from './gamedata';
import type { Buildings } from './buildings';
import type { Networks } from './networks';
import { quadrantOf, type PowerGrid, type PowerSum } from './power';

/** rate = items/min reaching the uploaders (null = fed from a station or storage, rate unknown). */
export interface DepotFlow { item: string; name: string; rate: number | null; uploaders: number }
export interface Circuit {
  key: string;
  kind: 'switch' | 'main' | 'island';
  name: string;
  /** Switches: is it on. */
  on?: boolean;
  priority: number | null;
  quadrant: string | null;
  /** The quadrant comes from the switch name (XnYn), else it is estimated from the machines' position. */
  quadrantFromTag: boolean;
  pos?: number[];
  /** Own segment + nested switches that are on. */
  power: PowerSum;
  /** Own segment only. */
  ownPower: PowerSum;
  nested: { name: string; on: boolean }[];
  parent: string | null;
  sloops: number;
  sloopBy: Record<string, number>;
  machines: Record<string, number>;
  note?: string;
  /** Alien Power Augmenters in the own circuit. */
  augmenters: number;
  /** What the own circuit uploads into the dimensional depot. */
  depotIn: DepotFlow[];
  /** Has generators but still runs negative (now or at full load). */
  genDeficit?: boolean;
  /** Instance names of the buildings on its own segment. */
  members: string[];
}
/** One powered building. c = key of the circuit that owns it (null = not wired). */
export interface MachineRow { c: string | null; b: string; r: string; clk: number; sl: number; gen: number; maxGen: number; draw: number; maxDraw: number; prod: number | null; at: number[]; id: string }
export interface SloopCount { machines: number; augmenters: number; augmenterSloops: number; depot: number }
export interface StoredItem { item: string; name: string; n: number }

export function buildCircuits(idx: ObjectIndex, names: Names, power: PowerGrid, buildings: Buildings, nets: Networks) {
  const P = power;
  const switchName = (sw: SaveObject) => prop(sw, 'mBuildingTag') || `Switch ${sid(sw.instanceName)}`;
  // circuit that owns a segment
  const circuitOfSeg = (s: string): string | null => {
    if (!P.wired.has(s) && s.startsWith('unwired:')) return null;
    if (s === P.mainSeg) return 'main';
    const sw = P.parentSw.get(s); if (sw) return sw.instanceName;
    const r = P.rootOf.get(s); return r ? (r === P.mainSeg ? 'main' : 'island:' + r) : null;
  };
  // depot uploaders: belt flow when it is known, else the item sitting in the uploader (fed from a station / storage)
  const depotOf = (b: SaveObject): [string, number | null][] => {
    const f = nets.depotFlow.get(b.instanceName); if (f) return [...f];
    return buildings.storedItems(b).map(i => [i, null]);
  };
  // depot uploaders need no power: they belong to the circuit of the machines that feed them (walking up through storage)
  const depotCircuit = new Map<string, string | null>();
  for (const u of idx.ofClass('Build_CentralStorage_C')) {
    let found: string | null = null; const seen = new Set([u.instanceName]); const q = [u.instanceName];
    for (let i = 0; i < q.length && !found && i < 200; i++) for (const n of nets.of(q[i])) {
      if (n.kind !== 'belt' || !n.sinks.some(x => x.instanceName === q[i])) continue;
      for (const src of n.sources) {
        const k = src.instanceName; if (seen.has(k)) continue; seen.add(k);
        if (P.wired.has(k)) { found = circuitOfSeg(P.segOf(k)); if (found) break; } else q.push(k);
      }
      if (found) break;
    }
    depotCircuit.set(u.instanceName, found ?? (P.wired.has(u.instanceName) ? circuitOfSeg(P.segOf(u.instanceName)) : null));
  }
  const circuit = (key: string, kind: Circuit['kind'], name: string, seg: string | null, extra: Partial<Circuit>): Circuit => {
    const c: Circuit = {
      key, kind, name, priority: null, quadrant: null, quadrantFromTag: false, power: P.sum(seg ? P.subtree(seg, true) : []), ownPower: P.sum(seg ? [seg] : []),
      nested: [], parent: null, sloops: 0, sloopBy: {}, machines: {}, augmenters: 0, depotIn: [], members: [], ...extra,
    };
    if (!seg) return c;
    // machines, sloops, augmenters, depot uploads: own circuit only (nested switches have their own circuit)
    for (const b of P.segMachines.get(seg) || []) {
      const nm = names.building(b); c.machines[nm] = (c.machines[nm] || 0) + 1; c.members.push(b.instanceName);
      const sl = buildings.sloops(b); if (sl) { c.sloops += sl; c.sloopBy[nm] = (c.sloopBy[nm] || 0) + sl; }
      if (cls(b) === 'Build_AlienPowerBuilding_C') c.augmenters++;
    }
    const dep = new Map<string, DepotFlow>();
    for (const [u, k] of depotCircuit) if (k === key) for (const [i, r] of depotOf(idx.at(u))) {
      const d = dep.get(i) ?? dep.set(i, { item: i, name: names.item(i), rate: null, uploaders: 0 }).get(i)!;
      d.uploaders++; if (r !== null) d.rate = round((d.rate ?? 0) + r);
    }
    c.depotIn = [...dep.values()].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
    const walk = (s: string) => { for (const sw of P.children.get(s) || []) { c.nested.push({ name: switchName(sw), on: P.isOn(sw) }); const b = P.behind.get(sw.instanceName); if (b) walk(b); } };
    walk(seg);
    return c;
  };
  const centroid = (segs: string[]) => {
    let x = 0, y = 0, k = 0;
    for (const s of segs) for (const b of P.segMachines.get(s) || []) { const t = b.transform?.translation; if (t) { x += t.x; y += t.y; k++; } }
    return k ? [x / k / 100, y / k / 100] : null;
  };

  const circuits: Circuit[] = [];
  for (const sw of P.switches) {
    const tag: string = prop(sw, 'mBuildingTag') || '';
    const b = P.behind.get(sw.instanceName) ?? null;
    const pr = prop(sw, 'mPriority');
    const [s1, s2] = P.sides(sw);
    const front = b ? (b === s1 ? s2 : s1) : null;
    const parentSwitch = front ? P.parentSw.get(front) : null;
    const m = tag.match(/X(\d+)\s*Y(\d+)/i);
    const c = circuit(sw.instanceName, 'switch', tag || `Switch ${sid(sw.instanceName)}`, b, {
      on: P.isOn(sw), priority: typeof pr === 'number' && pr >= 1 && pr <= 8 ? pr : null, pos: xyz(sw),
      parent: front ? (front === P.mainSeg ? 'Main grid' : parentSwitch ? switchName(parentSwitch) : P.rootOf.get(front) === P.mainSeg ? 'Main grid' : 'Isolated grid') : null,
    });
    if (m) { c.quadrant = `X${m[1]}Y${m[2]}`; c.quadrantFromTag = true; }
    else { const ce = (b && centroid([b])) || [sw.transform!.translation.x / 100, sw.transform!.translation.y / 100]; c.quadrant = quadrantOf(ce[0], ce[1]); }
    if (!b) c.note = 'Both sides of this switch are on the same circuit (bypassed) or it is not wired.';
    else if (P.parentSw.get(b) !== sw) c.note = 'The far side is also reachable through another path, so this switch cannot isolate it.';
    else if (P.rootOf.get(b) !== P.mainSeg) c.note = 'This switch is not connected to the main grid.';
    circuits.push(c);
  }
  const main = circuit('main', 'main', 'Main grid', P.mainSeg, { note: 'Everything not behind a priority switch.' });
  main.power = P.sum([P.mainSeg]); // own only for the main circuit; the live total is reported separately
  circuits.push(main);
  let islandN = 0;
  for (const s of P.segsBySize) if (P.rootOf.get(s) === s && s !== P.mainSeg && (P.segMachines.get(s)?.length ?? 0) > 0) {
    const ce = centroid([s]);
    circuits.push(circuit('island:' + s, 'island', `Separate grid #${++islandN}`, s, {
      note: 'Not connected to the main grid, even with every switch on.',
      quadrant: ce ? quadrantOf(ce[0], ce[1]) : null, pos: ce ? [Math.round(ce[0]), Math.round(ce[1])] : undefined,
    }));
  }
  // groups that run negative although they have generators
  for (const c of circuits) {
    if (c.kind === 'main') continue;
    const p = c.power;
    if (p.gens && (p.gen - p.draw < -0.5 || p.maxGen - p.maxDraw < -0.5)) c.genDeficit = true;
  }

  // one row per powered building, keyed to the circuit that owns it
  const machines: MachineRow[] = P.machines.filter(b => P.powered(b)).map(b => {
    const m = P.of(b); const p = buildings.productivity(b);
    return {
      c: P.wired.has(b.instanceName) ? circuitOfSeg(P.segOf(b.instanceName)) : null, b: names.building(b), r: names.recipe(b), clk: round(clockOf(b)),
      sl: buildings.sloops(b), gen: round(m.gen), maxGen: round(m.maxGen), draw: round(m.draw), maxDraw: round(m.maxDraw), prod: p === null ? null : round(p),
      at: xyz(b), id: sid(b.instanceName),
    };
  });

  // somersloops: in machines, spent on augmenters (10 each), waiting in the dimensional depot
  const augmenters = idx.ofClass('Build_AlienPowerBuilding_C').length;
  const sub = idx.objects.find(o => cls(o) === 'FGCentralStorageSubsystem');
  const depotStored: StoredItem[] = [];
  for (const s of prop(sub, 'mStoredItems') || []) {
    const i = leaf(s.properties?.ItemClass?.value?.pathName || ''); const n = val(s.properties?.Amount) || 0;
    if (i && n > 0) depotStored.push({ item: i, name: names.item(i), n });
  }
  depotStored.sort((a, b) => b.n - a.n);
  const sloops: SloopCount = { machines: machines.reduce((a, r) => a + r.sl, 0), augmenters, augmenterSloops: augmenters * 10, depot: depotStored.find(d => d.item === 'Desc_WAT1_C')?.n ?? 0 };

  return { circuits, machines, sloops, depotStored, live: P.sum(P.subtree(P.mainSeg, true)) };
}
