// Power grid: wires join buildings into circuit segments, priority switches join segments into a tree rooted at the
// main grid (the biggest segment). Also the power each building generates / draws, now and at full load.
import { bool, cls, clockOf, num, owner, push, UnionFind, type ObjectIndex, type SaveObject } from './objects';
import type { GameData } from './gamedata';

export interface PowerSum { gen: number; draw: number; maxGen: number; maxDraw: number; gens: number; idleGens: number; consumers: number }
export const emptyPower = (): PowerSum => ({ gen: 0, draw: 0, maxGen: 0, maxDraw: 0, gens: 0, idleGens: 0, consumers: 0 });
export interface BuildingPower { isGen: boolean; gen: number; maxGen: number; draw: number; maxDraw: number }
interface SwitchEdge { sw: SaveObject; a: string; b: string }

/** Quadrant grid fitted on the user's tagged switches (7 columns x 8 rows over the 7.5 km map). */
export const QUADRANT_GRID = { x0: -3149, cx: 7500 / 7, y0: 2829, cy: 937.5 };
export function quadrantOf(xM: number, yM: number) {
  const g = QUADRANT_GRID;
  return `X${Math.floor((xM - g.x0) / g.cx)}Y${Math.floor((g.y0 - yM) / g.cy)}`;
}

export class PowerGrid {
  readonly switches: SaveObject[];
  /** Power nodes with at least one wire. */
  readonly wired = new Set<string>();
  /** Buildings with a power info component. */
  readonly machines: SaveObject[] = [];
  readonly pinfo = new Map<string, SaveObject>();
  readonly segMachines = new Map<string, SaveObject[]>();
  /** Segments, biggest first. */
  readonly segsBySize: string[];
  readonly mainSeg: string;
  readonly depth = new Map<string, number>();
  /** Segment -> the switch that connects it to its parent segment. */
  readonly parentSw = new Map<string, SaveObject>();
  /** Segment -> root segment of its tree. */
  readonly rootOf = new Map<string, string>();
  /** Switch -> the segment behind it (away from the root), null when bypassed / not wired. */
  readonly behind = new Map<string, string | null>();
  /** Segment -> switches hanging off it. */
  readonly children = new Map<string, SaveObject[]>();
  /** World power cost multiplier inferred from running machines (5 in "100x 5x"). */
  readonly powerMult: number;
  private segUF = new UnionFind();
  private physUF = new UnionFind();
  private swEdges: SwitchEdge[];

  constructor(private idx: ObjectIndex, private gd: GameData) {
    this.switches = idx.ofClass('Build_PriorityPowerSwitch_C');
    const switchSet = new Set(this.switches.map(s => s.instanceName));
    const pnode = (connPath: string) => { const ow = owner(connPath); return switchSet.has(ow) ? connPath : ow; };
    for (const w of idx.objects) {
      if (cls(w) !== 'Build_PowerLine_C') continue;
      const sp = w.specialProperties; const a = sp?.source?.pathName, b = sp?.target?.pathName; if (!a || !b) continue;
      const na = pnode(a), nb = pnode(b); this.wired.add(na); this.wired.add(nb); this.segUF.union(na, nb);
    }
    for (const o of idx.objects) if (cls(o) === 'FGPowerInfoComponent') {
      const b = idx.get(owner(o.instanceName)); if (b && /^Build_/.test(cls(b))) { this.machines.push(b); this.pinfo.set(b.instanceName, o); }
    }
    for (const b of this.machines) if (this.wired.has(b.instanceName)) push(this.segMachines, this.segOf(b.instanceName), b);
    const segSize = new Map<string, number>();
    for (const n of this.wired) { const s = this.segUF.find(n); segSize.set(s, (segSize.get(s) || 0) + 1); }
    // segment graph through switches
    this.swEdges = this.switches.map(sw => ({ sw, a: this.segOf(sw.instanceName + '.PowerConnection1'), b: this.segOf(sw.instanceName + '.PowerConnection2') }));
    const segAdj = new Map<string, SwitchEdge[]>();
    for (const e of this.swEdges) if (e.a !== e.b) for (const s of [e.a, e.b]) push(segAdj, s, e);
    // roots: biggest segment = main; other unvisited segments with machines become island roots
    const bfs = (root: string) => {
      this.depth.set(root, 0); this.rootOf.set(root, root); const q = [root];
      for (let i = 0; i < q.length; i++) for (const e of segAdj.get(q[i]) || []) {
        const o = e.a === q[i] ? e.b : e.a;
        if (!this.depth.has(o)) { this.depth.set(o, this.depth.get(q[i])! + 1); this.parentSw.set(o, e.sw); this.rootOf.set(o, root); q.push(o); }
      }
    };
    this.segsBySize = [...segSize.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
    this.mainSeg = this.segsBySize[0] ?? 'none';
    bfs(this.mainSeg);
    for (const s of this.segsBySize) if (!this.depth.has(s) && (this.segMachines.get(s)?.length || segAdj.has(s))) bfs(s);
    // behind side of each switch
    for (const e of this.swEdges) {
      let b: string | null = null;
      if (e.a !== e.b) {
        const da = this.depth.get(e.a) ?? Infinity, db = this.depth.get(e.b) ?? Infinity;
        b = da > db ? e.a : db > da ? e.b : (this.parentSw.get(e.b) === e.sw ? e.b : e.a);
      }
      this.behind.set(e.sw.instanceName, b);
      if (b && this.parentSw.get(b) === e.sw) { const front = b === e.a ? e.b : e.a; push(this.children, front, e.sw); }
    }
    // physical connectivity to the main grid (all switches closed)
    for (const e of this.swEdges) this.physUF.union(e.a, e.b);
    // full-load draw = base MW x clock^1.321928 x boost^2 x world power multiplier
    const r: number[] = [];
    for (const b of this.machines) {
      if (this.isGen(b)) continue;
      const t = num(this.pinfo.get(b.instanceName), 'mTargetConsumption', 0), nd = this.nominalDraw(b);
      if (t >= 1 && nd > 0) r.push(t / nd);
    }
    r.sort((a, b) => a - b); this.powerMult = r.length ? r[r.length >> 1] : 1;
  }

  /** Circuit segment of a power node (unwired nodes get a segment of their own). */
  segOf(n: string) { return this.wired.has(n) ? this.segUF.find(n) : 'unwired:' + n; }
  isOn(sw: SaveObject) { return bool(sw, 'mIsSwitchOn'); }
  isGen(b: SaveObject) { return !!this.gd.buildings[cls(b)]?.pg || /Generator/.test(cls(b)); }
  /** Wired to something that reaches the main grid with every switch on. */
  onMainGrid(name: string) { return this.wired.has(name) && this.physUF.find(this.segOf(name)) === this.physUF.find(this.mainSeg); }
  /** Buildings that generate or use power. */
  powered(b: SaveObject) { return this.isGen(b) || !!this.gd.buildings[cls(b)]?.pu || num(this.pinfo.get(b.instanceName), 'mTargetConsumption', 0) > 0; }
  /** Segments on the two sides of a switch. */
  sides(sw: SaveObject): [string, string] { const e = this.swEdges.find(x => x.sw === sw)!; return [e.a, e.b]; }

  /** Draw at full load before the world multiplier. */
  nominalDraw(b: SaveObject) {
    const pu = this.gd.buildings[cls(b)]?.pu; if (!pu) return 0;
    const boost = num(b, 'mCurrentProductionBoost', 1); return pu * Math.pow(clockOf(b), 1.321928) * boost * boost;
  }
  /** Power of one building: current and full-load generation / draw (MW). */
  of(b: SaveObject): BuildingPower {
    const pi = this.pinfo.get(b.instanceName);
    if (this.isGen(b)) {
      const g = num(pi, 'mDynamicProductionCapacity', 0) + num(pi, 'mBaseProduction', 0);
      const pg = this.gd.buildings[cls(b)]?.pg;
      return { isGen: true, gen: g, maxGen: Math.max(g, typeof pg === 'number' ? pg * clockOf(b) : 0), draw: 0, maxDraw: 0 };
    }
    const d = num(pi, 'mTargetConsumption', 0);
    return { isGen: false, gen: 0, maxGen: 0, draw: d, maxDraw: Math.max(d, this.nominalDraw(b) * this.powerMult) };
  }
  sum(segs: string[]): PowerSum {
    const p = emptyPower();
    for (const s of segs) for (const b of this.segMachines.get(s) || []) {
      const m = this.of(b);
      if (m.isGen) { p.gens++; p.gen += m.gen; if (m.gen <= 0) p.idleGens++; p.maxGen += m.maxGen; }
      else { p.consumers++; p.draw += m.draw; p.maxDraw += m.maxDraw; }
    }
    return p;
  }
  /** A segment and everything behind its switches (liveOnly: only through switches that are on). */
  subtree(seg: string, liveOnly: boolean): string[] {
    const out = [seg];
    for (let i = 0; i < out.length; i++) for (const sw of this.children.get(out[i]) || []) if (!liveOnly || this.isOn(sw)) { const b = this.behind.get(sw.instanceName); if (b) out.push(b); }
    return out;
  }
}
