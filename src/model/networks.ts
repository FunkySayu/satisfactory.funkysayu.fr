// Belt and pipe networks: every connected set of transport parts with the machines at its ends (terminals).
// Each network is solved per item with max-flow: how much reaches the consumers, where the narrowest cut is when
// it falls short, what backs up, which belts may be overloaded, and (pipes) the head lift. The results are facts;
// the analyzers decide what is a problem.
import { cls, fmt, owner, push, round, tol, UnionFind, xyz, type ObjectIndex, type SaveObject } from './objects';
import type { Names } from './gamedata';
import { BELT_PART, type Logistics } from './logistics';
import type { Flows } from './flows';
import type { PowerGrid } from './power';
import { FlowGraph } from './maxflow';
import { buildDiagram, orientPipeDiagram, type NetGraph, type NetSeverity } from './diagram';

export type NetKind = 'belt' | 'pipe';
type Rates = Map<string, Record<string, number>>;

/** One item on one network, solved. Rates per minute. */
export interface ItemSolution {
  item: string;
  supply: number; demand: number;
  /** [terminal, rate] of the machines producing / consuming it on this network. */
  producers: [string, number][]; consumers: [string, number][];
  /** Routed from the producers to the consumers; from blueprint inputs; overflow into unlimited sinks. */
  toConsumers: number; fromBoundary: number; toSinks: number;
  /** What should reach the consumers: min(supply, demand), or the whole demand when blueprint inputs make up the rest. */
  target: number;
  /** The consumers get less than target (only solved when the network has no external I/O). cut = narrowest parts,
   *  empty when the routing simply does not reach some consumers (unmet). */
  short?: { flow: number; cut: string[]; unmet: [string, number][] };
  /** Producers cannot send all they make although unlimited sinks are on the network. */
  backup?: { cut: string[]; unused: [string, number][] };
  /** Belts whose upstream supply and downstream demand both exceed their capacity, worst first. */
  overloaded: { part: string; need: number; cap: number }[];
}

export interface NetSummary {
  kind: NetKind; label: string; at: number[]; sev: NetSeverity;
  parts: number; items: { item: string; supply: number; demand: number | null; flow: number; ext?: number }[]; extra?: string;
  /** Index in the graph list. */
  g: number;
}

/** Highest climb above a producer's outlet on the way to the consumers (m). */
export interface HeadLift { rise: number; base: string; peak: SaveObject; text: string }

export class Network {
  index = -1;
  label = '';
  readonly transport: SaveObject[] = [];
  readonly sources: SaveObject[] = [];
  readonly sinks: SaveObject[] = [];
  readonly terminals = new Set<string>();
  supply: Rates = new Map();
  demand: Rates = new Map();
  /** Unknown I/O (station, storage, unresolved recipe): balance verdicts are skipped. */
  external = false;
  /** Has a sink that takes anything. */
  unlimited = false;
  /** Blueprint inputs on this network. */
  boundaryInputs: string[] = [];
  items: ItemSolution[] = [];
  /** Building the network's messages point at. */
  anchor!: SaveObject;
  summary!: NetSummary;
  graph!: NetGraph;
  nodeOf = new Map<string, number>();
  edgeOf = new Map<string, number>();
  heads: [string, string][] = [];
  headLift?: HeadLift;
  /** Belt ends with nothing downstream (only on networks that carry something). */
  openEnds: SaveObject[] = [];
  constructor(readonly kind: NetKind) {}

  /** Diagram nodes / edges of these buildings and parts. */
  locate(names: string[], parts: string[] = []) {
    const n = new Set<number>(), e = new Set<number>();
    for (const k of [...names, ...parts]) { const a = this.nodeOf.get(k); if (a !== undefined) n.add(a); const b = this.edgeOf.get(k); if (b !== undefined) e.add(b); }
    return { nodes: [...n], edges: [...e] };
  }
}

function* permutations<T>(xs: T[]): Generator<T[]> {
  if (xs.length <= 1) { yield xs; return; }
  for (let i = 0; i < xs.length; i++) for (const p of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i], ...p];
}

export class Networks {
  readonly belts: Network[] = [];
  readonly pipes: Network[] = [];
  /** Same order as the network indexes. */
  readonly graphs: NetGraph[] = [];
  /** Dimensional depot uploader -> item -> items/min the line can push into it. */
  readonly depotFlow = new Map<string, Map<string, number>>();
  /** Blueprint boundary terminal -> item -> rate (+ in, - out). */
  readonly boundaryFlow = new Map<string, Record<string, number>>();
  private netsOf = new Map<string, Network[]>();
  private partNet = new Map<string, Network>();
  private assigned = new Map<string, Map<string, Network>>();
  /** Blueprints: the item(s) each open input line can bring (see deduceLineItems). */
  private lineItems = new Map<Network, Set<string>>();

  constructor(private idx: ObjectIndex, private lg: Logistics, private flows: Flows, private names: Names, private power: PowerGrid, private blueprint: boolean) {
    this.buildBelts(); this.buildPipes();
    for (const n of this.all) for (const t of n.transport) this.partNet.set(t.instanceName, n);
    if (blueprint) this.deduceLineItems();
    for (const n of this.all) this.solve(n);
  }

  get all() { return [...this.belts, ...this.pipes]; }
  /** Networks a terminal (machine) is on. */
  of(name: string): Network[] { return this.netsOf.get(name) || []; }
  /** Network a transport part belongs to. */
  ofPart(name: string) { return this.partNet.get(name); }

  private link(t: string, n: Network) { if (!n.terminals.has(t)) { n.terminals.add(t); push(this.netsOf, t, n); } }

  private buildBelts() {
    const { idx, lg } = this;
    const uf = new UnionFind(); const trans = new Set<string>();
    for (const [a, outs] of lg.bOut) for (const b of outs) {
      const ta = lg.isBeltTransport(idx.at(a)), tb = lg.isBeltTransport(idx.at(b));
      if (ta) trans.add(a); if (tb) trans.add(b);
      if (ta && tb) uf.union(a, b); else if (!ta && !tb) uf.union('pair:' + a, 'pair:' + b);
    }
    for (const ports of lg.beltPorts.values()) for (const p of ports) if (lg.isBeltTransport(idx.at(p.owner))) { trans.add(p.owner); uf.find(p.owner); }
    const byRoot = new Map<string, Network>();
    const get = (r: string) => byRoot.get(r) ?? byRoot.set(r, new Network('belt')).get(r)!;
    for (const t of trans) get(uf.find(t)).transport.push(idx.at(t));
    for (const [a, outs] of lg.bOut) for (const b of outs) {
      const ta = trans.has(a), tb = trans.has(b);
      if (ta && tb) continue;
      const n = ta ? get(uf.find(a)) : tb ? get(uf.find(b)) : get(uf.find('pair:' + a));
      if (!ta) { if (!n.sources.some(x => x.instanceName === a)) n.sources.push(idx.at(a)); this.link(a, n); }
      if (!tb) { if (!n.sinks.some(x => x.instanceName === b)) n.sinks.push(idx.at(b)); this.link(b, n); }
    }
    this.belts.push(...[...byRoot.values()].filter(n => n.sources.length || n.sinks.length));
  }

  private buildPipes() {
    const { idx, lg } = this;
    const uf = new UnionFind(); const trans = new Set<string>();
    for (const ow of lg.pipePorts.keys()) if (lg.isPipeTransport(idx.at(ow))) { trans.add(ow); uf.find(ow); }
    for (const [a, s] of lg.pAdj) for (const b of s) {
      if (trans.has(a) && trans.has(b)) uf.union(a, b); else if (!trans.has(a) && !trans.has(b)) uf.union('pair:' + a, 'pair:' + b);
    }
    const byRoot = new Map<string, Network>();
    const get = (r: string) => byRoot.get(r) ?? byRoot.set(r, new Network('pipe')).get(r)!;
    for (const t of trans) get(uf.find(t)).transport.push(idx.at(t));
    for (const [a, s] of lg.pAdj) for (const b of s) {
      if (trans.has(a)) continue;
      const n = trans.has(b) ? get(uf.find(b)) : get(uf.find('pair:' + a));
      if (!n.terminals.has(a)) { n.sources.push(idx.at(a)); n.sinks.push(idx.at(a)); this.link(a, n); }
    }
    this.pipes.push(...[...byRoot.values()].filter(n => n.terminals.size));
  }

  /** Is this terminal's connection to the network an input (pipes: by the port names; belts: it is a sink). */
  private feedsInto(t: SaveObject, n: Network) {
    if (n.kind === 'belt') return true;
    const ps = (this.lg.pipePorts.get(t.instanceName) || []).filter(p => p.to && (n.transport.some(x => x.instanceName === owner(p.to!)) || n.terminals.has(owner(p.to))));
    return !ps.length || ps.some(p => !/Output/i.test(p.name));
  }

  /** Blueprints: what each open input line brings. A belt (or pipe) carries one item and every machine it feeds needs
   *  that item:
   *  1. a line with a producer inside carries what that producer makes;
   *  2. otherwise its candidates are the intersection of the recipe inputs of the machines it feeds;
   *  3. elimination: an item that already reaches a machine through another of its lines is not on this one;
   *  4. lines left with the same candidates, as many lines as candidates, are interchangeable (the player puts any item
   *     on any of them): one item each, choosing the assignment the lines can deliver best (narrow branches matter).
   *  Steps 3-4 repeat until nothing changes. A line still left with several candidates keeps them all. */
  private deduceLineItems() {
    for (const [nets, fluid] of [[this.belts, false], [this.pipes, true]] as const) {
      const cand = new Map<Network, Set<string>>();
      const fixed = new Set<Network>();   // decided: a single item, or what a producer inside makes
      const feeds = (n: Network) => n.sinks.filter(t => !t.virtual && this.feedsInto(t, n));
      const need = (t: SaveObject) => Object.keys(this.flows.pick(this.flows.of(t).inp, fluid));
      for (const n of nets) {
        if (![...n.terminals].some(t => this.flows.of(this.idx.at(t)).boundary)) continue;
        let S: Set<string> | undefined;
        for (const t of feeds(n)) { const w = need(t); if (!w.length) continue; S = S ? new Set([...S].filter(i => w.includes(i))) : new Set(w); }
        if (!S || !S.size) continue;
        const made = [...S].filter(i => n.sources.some(src => !src.virtual && this.flows.of(src).out[i]));
        if (made.length) { cand.set(n, new Set(made)); fixed.add(n); } else cand.set(n, S);
      }
      // lines of each machine (only those with candidates), for elimination
      const linesOf = new Map<SaveObject, Network[]>();
      for (const n of cand.keys()) for (const t of feeds(n)) push(linesOf, t as any, n);
      const capOf = (n: Network) => Math.max(0, ...n.transport.map(p => (fluid ? this.lg.pipeCap(p) : this.lg.beltCap(p)) ?? 0));
      for (let changed = true; changed;) {
        changed = false;
        // 3. elimination
        for (const [t, ls] of linesOf) for (const n of ls) {
          if (fixed.has(n)) continue;
          const taken = new Set<string>(); for (const o of ls) if (o !== n && cand.get(o)!.size === 1) taken.add([...cand.get(o)!][0]);
          const left = [...cand.get(n)!].filter(i => !taken.has(i));
          if (left.length && left.length < cand.get(n)!.size) { cand.set(n, new Set(left)); changed = true; }
          if (cand.get(n)!.size === 1) { fixed.add(n); }
        }
        // 4. interchangeable groups
        const groups = new Map<string, Network[]>();
        for (const [n, S] of cand) if (!fixed.has(n) && S.size > 1) { const k = [...S].sort().join('|'); push(groups, k, n); }
        for (const [k, g] of groups) {
          const items = k.split('|'); if (g.length !== items.length || items.length > 5) continue;
          let best: string[] = items, bestScore = -1;
          for (const perm of permutations(items)) {
            const score = g.reduce((a, n, j) => a + this.routable(n, perm[j], fluid), 0) + 1e-6 * g.reduce((a, n, j) => a + capOf(n) * (j === 0 ? 1 : 0), 0);
            if (score > bestScore) { bestScore = score; best = perm; }
          }
          g.forEach((n, j) => { cand.set(n, new Set([best[j]])); fixed.add(n); });
          changed = true;
        }
      }
      for (const [n, S] of cand) this.lineItems.set(n, S);
    }
  }

  /** How much of an item one open line can bring to the machines it feeds (max-flow from its open input ends). */
  private routable(n: Network, item: string, fluid: boolean): number {
    const ids = new Map<string, [number, number]>(); let N = 2;
    for (const p of n.transport) { const a = N++, c = fluid ? this.lg.pipeCap(p) : this.lg.beltCap(p); ids.set(p.instanceName, [a, c != null ? N++ : a]); }
    for (const t of n.terminals) { const a = N++; ids.set(t, [a, a]); }
    const g = new FlowGraph(N);
    for (const p of n.transport) { const [a, b] = ids.get(p.instanceName)!; const c = fluid ? this.lg.pipeCap(p) : this.lg.beltCap(p); if (c != null) g.addEdge(a, b, c); }
    const adj = fluid ? this.lg.pAdj : this.lg.bOut;
    for (const [k, [, out]] of ids) for (const y of adj.get(k) || []) { const t = ids.get(y); if (t) g.addEdge(out, t[0], 1e9); }
    for (const t of n.terminals) {
      const o = this.idx.at(t), [a] = ids.get(t)!;
      if (this.flows.of(o).boundary) g.addEdge(0, a, 1e9);
      else if (n.sinks.includes(o) && this.feedsInto(o, n)) { const r = this.flows.of(o).inp[item]; if (r) g.addEdge(a, 1, r); }
    }
    return g.maxflow(0, 1);
  }

  /** Blueprints: a machine whose inputs can only come from outside, through several open lines, gets each item on one
   *  line (largest first, onto the line with the most belt capacity left) instead of counting it on every line. */
  private assign(t: SaveObject, fluid: boolean, cands: Network[], item: string): Network {
    const k = t.instanceName + (fluid ? '|f' : '|s');
    let m = this.assigned.get(k);
    if (!m) {
      m = new Map(); this.assigned.set(k, m);
      const want = Object.entries(this.flows.pick(this.flows.of(t).inp, fluid)).sort((a, b) => b[1] - a[1]);
      // a line that already brings another of this machine's inputs from a producer inside is taken by that input
      const made = (x: Network) => x.sources.some(s => s.instanceName !== t.instanceName && want.some(([i]) => this.flows.of(s).out[i]));
      const free = cands.filter(x => !made(x));
      if (free.length) cands = free;
      const capIn = (x: Network) => {
        let c = 0;
        for (const u of this.lg.bIn.get(t.instanceName) || []) if (x.transport.some(p => p.instanceName === u)) c = Math.max(c, this.lg.beltCap(this.idx.at(u)) ?? 1e9);
        return c || 1e9;
      };
      const left = new Map(cands.map(x => [x, fluid ? 1e9 : capIn(x)]));
      for (const [i, r] of want) { let best = cands[0]; for (const x of cands) if (left.get(x)! > left.get(best)!) best = x; m.set(i, best); left.set(best, left.get(best)! - r); }
    }
    return m.get(item) ?? cands[0];
  }

  /** Demand / supply attribution: an item a terminal produces / consumes is attributed to the networks that can carry it. */
  private attribute(n: Network) {
    const { flows, lg } = this;
    const fluid = n.kind === 'pipe';
    const portDir = (t: SaveObject, dir: 'in' | 'out') => { // pipes: is this terminal's connection to this net an input / output port?
      if (!fluid) return true;
      const ps = (lg.pipePorts.get(t.instanceName) || []).filter(p => p.to && (n.transport.some(x => x.instanceName === owner(p.to!)) || n.terminals.has(owner(p.to))));
      if (!ps.length) return true;
      return ps.some(p => dir === 'in' ? !/Output/i.test(p.name) : !/Input/i.test(p.name));
    };
    for (const t of n.sources) {
      const f = flows.of(t); if (f.unknown) n.external = true;
      if (portDir(t, 'out')) { const o = flows.pick(f.out, fluid); if (Object.keys(o).length) n.supply.set(t.instanceName, o); }
    }
    for (const t of n.sinks) {
      const f = flows.of(t); if (f.unknown) n.external = true; if (f.unlimited) n.unlimited = true;
      if (!portDir(t, 'in')) continue;
      const want = flows.pick(f.inp, fluid); const mine: Record<string, number> = {};
      for (const [i, r] of Object.entries(want)) {
        const nets = this.of(t.instanceName).filter(x => x.kind === n.kind && x.sinks.includes(t));
        const others = (x: Network) => x.sources.filter(s => s.instanceName !== t.instanceName);
        let carriers = nets.filter(x => others(x).some(s => flows.of(s).out[i]));
        // an open line deduced to bring this item; none of them, and the machine has an open port: it comes in there
        if (!carriers.length && this.blueprint) carriers = nets.filter(x => this.lineItems.get(x)?.has(i));
        if (!carriers.length && this.blueprint && flows.openPort(t.instanceName, fluid, 'in')) continue;
        if (!carriers.length) carriers = nets.filter(x => others(x).some(s => flows.of(s).unknown || flows.of(s).boundary));
        if (this.blueprint && carriers.length > 1 && carriers.every(x => !others(x).some(s => flows.of(s).out[i]))) carriers = [this.assign(t, fluid, carriers, i)];
        if (!carriers.length && this.blueprint && flows.openPort(t.instanceName, fluid, 'in')) continue; // comes in through the machine's open port
        // nobody carries it: blame an input line that has no producer at all, else the first input line
        const fallback = nets.find(x => !others(x).length) ?? nets[0];
        if (carriers.includes(n) || (!carriers.length && fallback === n)) mine[i] = r;
      }
      if (Object.keys(mine).length) n.demand.set(t.instanceName, mine);
    }
  }

  private addDepot(k: string, item: string, f: number) { const m = this.depotFlow.get(k) ?? this.depotFlow.set(k, new Map()).get(k)!; m.set(item, (m.get(item) || 0) + f); }
  private addBoundary(k: string, item: string, f: number) { const m = this.boundaryFlow.get(k) ?? this.boundaryFlow.set(k, {}).get(k)!; m[item] = (m[item] || 0) + f; }

  private solve(n: Network) {
    const { idx, lg, flows, names } = this;
    this.attribute(n);
    const sup = n.supply, dem = n.demand;
    const items = new Set<string>(); for (const r of sup.values()) Object.keys(r).forEach(i => items.add(i)); for (const r of dem.values()) Object.keys(r).forEach(i => items.add(i));
    const bIns = n.boundaryInputs = [...n.terminals].filter(t => flows.of(idx.at(t)).boundary);
    n.label = [...items].map(i => names.item(i)).join(', ') || (n.terminals.size && [...n.terminals].every(t => idx.at(t).virtual) ? 'pass-through' : '(empty)');
    n.anchor = n.sources.find(s => sup.has(s.instanceName)) ?? n.transport[0] ?? n.sinks[0];
    const D = buildDiagram(n, idx, lg, names, this.power);
    const G = D.graph; G.label = n.label; n.nodeOf = D.nodeOf; n.edgeOf = D.edgeOf; n.heads = D.heads;
    n.index = this.graphs.length; this.graphs.push(G); n.graph = G;
    const summary: NetSummary = n.summary = { kind: n.kind, label: n.label, at: xyz(n.anchor), sev: 'ok', parts: n.transport.length, items: [], g: n.index };
    // flow graph: transport parts with a capacity are split in two nodes joined by an edge of that capacity
    let N = 2; const S = 0, T = 1;
    const transCap = new Map<string, number>(); const nodeIn = new Map<string, number>(), nodeOut = new Map<string, number>();
    for (const t of n.transport) {
      const cap = n.kind === 'belt' ? lg.beltCap(t) : lg.pipeCap(t); const i = N++; nodeIn.set(t.instanceName, i);
      if (cap != null) { nodeOut.set(t.instanceName, N++); transCap.set(t.instanceName, cap); } else nodeOut.set(t.instanceName, i);
    }
    for (const t of n.terminals) { nodeIn.set(t, N++); nodeOut.set(t, N++); }
    const build = () => {
      const g = new FlowGraph(N); const capEdge = new Map<string, number>(); const link = new Map<string, number>();
      for (const [k, c] of transCap) capEdge.set(k, g.addEdge(nodeIn.get(k)!, nodeOut.get(k)!, c));
      const adj = n.kind === 'belt' ? lg.bOut : lg.pAdj;
      for (const t of [...n.transport.map(x => x.instanceName), ...n.terminals]) for (const b of adj.get(t) || []) if (nodeIn.has(b)) {
        if (n.terminals.has(t) && n.terminals.has(b) && n.transport.length) continue;
        link.set(`${t}>${b}`, g.addEdge(nodeOut.get(t)!, nodeIn.get(b)!, 1e9));
      }
      return { g, capEdge, link };
    };
    const reachFrom = (start: string, fwd: boolean) => { // over transport only (belts directed, pipes undirected)
      const seen = new Set<string>(); const q = [start];
      for (let i = 0; i < q.length; i++) {
        const x = q[i]; const nb = n.kind === 'pipe' ? lg.pAdj.get(x) : (fwd ? lg.bOut.get(x) : lg.bIn.get(x));
        for (const y of nb || []) if (!seen.has(y) && nodeIn.has(y)) { seen.add(y); if (!n.terminals.has(y)) q.push(y); }
      }
      return seen;
    };
    const flagged = new Set<string>(); const overParts = new Set<string>();
    for (const item of items) {
      const S_ = [...sup].filter(([, r]) => r[item]).map(([k, r]) => [k, r[item]] as [string, number]);
      const D_ = [...dem].filter(([, r]) => r[item]).map(([k, r]) => [k, r[item]] as [string, number]);
      const supply = S_.reduce((a, x) => a + x[1], 0), demand = D_.reduce((a, x) => a + x[1], 0);
      const { g, capEdge, link } = build();
      const sEdge = S_.map(([k, r]) => g.addEdge(S, nodeOut.get(k)!, r));
      const tEdge = D_.map(([k, r]) => g.addEdge(nodeIn.get(k)!, T, r));
      const cutOf = () => {
        const reach = g.reachable(S); const cut: string[] = [];
        for (const k of capEdge.keys()) if (reach[nodeIn.get(k)!] && !reach[nodeOut.get(k)!]) cut.push(k);
        return cut;
      };
      // phase 1: real consumers first (splitters feed machines before overflow reaches a sink / storage)
      const flow1 = g.maxflow(S, T);
      // blueprint inputs make up what the machines inside do not produce
      let flowB = 0; const bEdge: [string, number][] = [];
      if (bIns.length && demand > 0 && flow1 < demand - tol(demand)) {
        for (const v of bIns) bEdge.push([v, g.addEdge(S, nodeOut.get(v)!, 1e9)]);
        flowB = g.maxflow(S, T);
      }
      const target = bIns.length ? demand : Math.min(supply, demand);
      const sol: ItemSolution = { item, supply, demand, producers: S_, consumers: D_, toConsumers: flow1, fromBoundary: flowB, toSinks: 0, target, overloaded: [] };
      if (!n.external && (supply > 0 || bIns.length) && demand > 0 && flow1 + flowB < target - tol(target)) {
        const cut = cutOf();
        sol.short = { flow: flow1 + flowB, cut, unmet: cut.length ? [] : D_.map(([k], i) => [k, g.residual(tEdge[i])] as [string, number]).filter(x => x[1] > tol(x[1])) };
        cut.forEach(c => flagged.add(c));
      }
      for (const [v, e] of bEdge) { const f = 1e9 - g.residual(e); if (f > 1e-6) this.addBoundary(v, item, f); g.freeze(e); }
      // phase 2: overflow into unlimited sinks (AWESOME sink, dimensional depot, storage at the end of a line, blueprint output)
      const se: [string, number][] = [];
      if (n.unlimited) {
        for (const t of n.sinks) if (flows.of(t).unlimited) se.push([t.instanceName, g.addEdge(nodeIn.get(t.instanceName)!, T, 1e9)]);
        sol.toSinks = g.maxflow(S, T);
        for (const [k, e] of se) if (idx.at(k).virtual) { const f = 1e9 - g.residual(e); if (f > 1e-6) this.addBoundary(k, item, -f); }
      }
      // diagram: what the solver routes through each chain
      G.edges.forEach((ed, ei) => {
        const h = n.heads[ei]; if (!h) return;
        const [a, b] = h; const fw = link.get(`${a}>${b}`), bw = n.kind === 'pipe' ? link.get(`${b}>${a}`) : undefined;
        const f = (fw !== undefined ? 1e9 - g.residual(fw) : 0) - (bw !== undefined ? 1e9 - g.residual(bw) : 0);
        if (Math.abs(f) > 1e-6) ed.f[item] = round((ed.f[item] || 0) + f);
      });
      // dimensional depot: rate the line can push into the uploaders when they pull (smart splitter with the consumers
      // on overflow, storage buffers in front of the uploaders). Consumers are ignored: the depot fills first.
      const depots = n.sinks.filter(t => !t.virtual && cls(t) === 'Build_CentralStorage_C');
      if (depots.length && S_.length) {
        const { g: gD } = build();
        for (const [k, r] of S_) gD.addEdge(S, nodeOut.get(k)!, r);
        const de = depots.map(t => [t.instanceName, gD.addEdge(nodeIn.get(t.instanceName)!, T, 1e9)] as [string, number]);
        gD.maxflow(S, T);
        for (const [k, e] of de) { const f = 1e9 - gD.residual(e); if (f > 1e-6) this.addDepot(k, item, f); }
      }
      n.items.push(sol);
      summary.items.push({ item: names.item(item), supply: round(supply), demand: n.unlimited ? null : round(demand), flow: round(flow1 + flowB + sol.toSinks), ...(flowB > 1e-6 ? { ext: round(flowB) } : {}) });
      if (n.external) continue; // unknown I/O: no backup / load verdicts
      const internal = flow1 + sol.toSinks;
      if (n.unlimited && !sol.short && internal < supply - tol(supply)) {
        const cut = cutOf();
        sol.backup = { cut, unused: S_.map(([k], i) => [k, g.residual(sEdge[i])] as [string, number]).filter(x => x[1] > tol(x[1])) };
        cut.forEach(c => flagged.add(c));
      }
      // per-part load: load = min(upstream supply, downstream demand). Pipes are undirected: the max-flow verdict covers them.
      const S_load = [...S_, ...bIns.map(v => [v, this.boundaryFlow.get(v)?.[item] ?? 0] as [string, number]).filter(x => x[1] > 0)];
      if (n.kind === 'belt' && transCap.size && S_load.length) {
        const up = new Map<string, number>(), down = new Map<string, number>();
        for (const [k, r] of S_load) for (const x of reachFrom(k, true)) up.set(x, (up.get(x) || 0) + r);
        for (const [k, r] of D_) for (const x of reachFrom(k, false)) down.set(x, (down.get(x) || 0) + r);
        if (n.unlimited) for (const t of n.sinks) if (flows.of(t).unlimited) for (const x of reachFrom(t.instanceName, false)) down.set(x, Infinity);
        for (const [k, cap] of transCap) {
          if (flagged.has(k)) continue;
          const need = Math.min(up.get(k) || 0, down.get(k) || 0); if (need > cap + tol(cap)) sol.overloaded.push({ part: k, need, cap });
        }
        sol.overloaded.sort((a, b) => (b.need - b.cap) - (a.need - a.cap));
        sol.overloaded.forEach(x => overParts.add(x.part));
      }
    }
    if (n.external) summary.extra = 'has external I/O (station / storage / unknown recipe): balance not verified';
    if (n.kind === 'pipe' && sup.size) this.solveHeadLift(n);
    if (n.kind === 'belt' && sup.size) n.openEnds = n.transport.filter(t => BELT_PART.test(cls(t)) && !(lg.bOut.get(t.instanceName)?.size));
    for (const k of flagged) { const e = n.edgeOf.get(k); if (e !== undefined) G.edges[e].bad = 'cut'; }
    for (const k of overParts) { const e = n.edgeOf.get(k); if (e !== undefined && !G.edges[e].bad) G.edges[e].bad = 'over'; }
    if (n.kind === 'pipe') orientPipeDiagram(G);
    G.extra = summary.extra;
  }

  /** Head lift in the direction of flow: for each producer (or pump), the lowest possible peak on a route to a
   *  consumer (or the next pump), above the producer's outlet. Pipe that only runs downhill to the consumers needs none. */
  private solveHeadLift(n: Network) {
    const { idx, lg, names } = this;
    const members = new Set(n.transport.map(o => o.instanceName));
    const hc = new Map<string, number>();
    const h = (k: string) => { let v = hc.get(k); if (v == null) { v = lg.topZ(idx.at(k)); hc.set(k, v); } return v; };
    const bases: [string, number][] = [];
    for (const t of n.terminals) if (n.supply.has(t)) bases.push([t, lg.outletZ(idx.at(t), members)]);
    for (const o of n.transport) if (lg.isPump(o)) bases.push([o.instanceName, o.transform!.translation.z]);
    let worst: HeadLift | undefined;
    for (const [base, baseZ] of bases) {
      // minimax (bottleneck) Dijkstra over the pipe parts: cost = highest point reached so far
      const cost = new Map<string, number>(), peak = new Map<string, string>(); const done = new Set<string>();
      for (const y of lg.pAdj.get(base) || []) if (members.has(y)) { const c = h(y); if (c < (cost.get(y) ?? Infinity)) { cost.set(y, c); peak.set(y, y); } }
      let found: string | null = null;
      for (;;) {
        let x: string | null = null, cx = Infinity;
        for (const [k, c] of cost) if (!done.has(k) && c < cx) { cx = c; x = k; }
        if (x == null) break; done.add(x);
        if (x !== base && lg.isPump(idx.at(x))) { found = x; break; } // the next pump takes over
        if ([...(lg.pAdj.get(x) || [])].some(y => y !== base && n.terminals.has(y) && n.demand.has(y))) { found = x; break; }
        for (const y of lg.pAdj.get(x) || []) if (members.has(y) && y !== base && !done.has(y)) {
          const c = Math.max(cx, h(y)); if (c < (cost.get(y) ?? Infinity)) { cost.set(y, c); peak.set(y, h(y) > cx ? y : peak.get(x)!); }
        }
      }
      if (found == null) continue; // reaches no consumer: reported elsewhere
      const rise = (cost.get(found)! - baseZ) / 100;
      if (!worst || rise > worst.rise) {
        const b = idx.at(base), hi = idx.at(peak.get(found)!);
        worst = { rise, base, peak: hi, text: `from ${names.building(b)} at (${xyz(b).join(', ')}) up to (${xyz(hi).join(', ')}) on its way to the consumers` };
      }
    }
    if (!worst) return;
    n.headLift = worst;
    n.summary.extra = `${n.summary.extra ? n.summary.extra + ' · ' : ''}head lift ${fmt(Math.max(0, worst.rise))} m`;
  }
}
