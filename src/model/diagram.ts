// Network diagram of one belt / pipe network: chains of belts or pipes collapse into one edge between two nodes
// (machines, splitters / mergers, junctions, pumps, open ends...). Flows on the edges are filled in by the solver.
import { cls, clockOf, round, sid, xyz, type ObjectIndex, type SaveObject } from './objects';
import type { Names } from './gamedata';
import { BELT_PART, BUFFER, EXTERNAL, UNLIMITED_SINKS, type Logistics } from './logistics';
import type { PowerGrid } from './power';

/** m machine, split / merge, store (container), sink (AWESOME sink, depot), ext (station), junc / pump / valve,
 *  in / out / io (blueprint boundary), start / end (unconnected belt or pipe end). */
export type GKind = 'm' | 'split' | 'merge' | 'store' | 'sink' | 'ext' | 'junc' | 'pump' | 'valve' | 'in' | 'out' | 'io' | 'start' | 'end';
/** c: class (for the icon), n: name, r: recipe / detail, id: short id, at: position (m), z: height (m), clk: clock,
 *  io: per item what the node supplies (s) and demands (d) on this network. */
export interface GNode { t: GKind; c: string; n: string; r?: string; id: string; at: number[]; z?: number; clk?: number; io?: { i: string; s?: number; d?: number }[] }
/** A chain of belts / pipes between two nodes. f = item -> flow found by the solver (a -> b). */
export interface GEdge { a: number; b: number; cap: number | null; tier: string; parts: number; f: Record<string, number>; z?: number; bad?: 'cut' | 'over' }
export type NetSeverity = 'ok' | 'warn' | 'error';
export interface NetGraph { kind: 'belt' | 'pipe'; label: string; sev: NetSeverity; nodes: GNode[]; edges: GEdge[]; items: Record<string, string>; extra?: string }

export interface DiagramInput {
  kind: 'belt' | 'pipe'; transport: SaveObject[]; terminals: Set<string>;
  supply: Map<string, Record<string, number>>; demand: Map<string, Record<string, number>>;
}
export interface Diagram {
  graph: NetGraph;
  /** Building / part instance name -> node index. */
  nodeOf: Map<string, number>;
  /** Transport part instance name -> edge index. */
  edgeOf: Map<string, number>;
  /** Edge index -> [member it starts from, first member on it], to read the solver's flows. */
  heads: [string, string][];
}

export function gkind(o: SaveObject): GKind {
  if (o.virtual) return o.virtual; const C = cls(o);
  if (/Splitter/.test(C)) return 'split'; if (/Merger/.test(C)) return 'merge';
  if (/PipelineJunction/.test(C)) return 'junc'; if (/PipelinePump/.test(C)) return 'pump'; if (C === 'Build_Valve_C') return 'valve';
  if (UNLIMITED_SINKS.test(C)) return 'sink'; if (EXTERNAL.test(C)) return 'ext';
  if (/^Build_StorageContainer/.test(C) || BUFFER.test(C)) return 'store'; return 'm';
}

export function buildDiagram(n: DiagramInput, idx: ObjectIndex, lg: Logistics, names: Names, power: PowerGrid): Diagram {
  const pipe = n.kind === 'pipe';
  const members = new Set([...n.transport.map(o => o.instanceName), ...n.terminals]);
  const chainPart = (k: string) => { const o = idx.at(k); return pipe ? lg.isPipeSegment(o) : BELT_PART.test(cls(o)) && !o.virtual; };
  const nodes: GNode[] = []; const edges: GEdge[] = []; const items: Record<string, string> = {};
  const nodeOf = new Map<string, number>(), edgeOf = new Map<string, number>();
  const addNode = (k: string, t?: GKind) => {
    const o = idx.at(k); const id = nodes.length; nodeOf.set(k, id);
    const io: GNode['io'] = []; const s = n.supply.get(k), d = n.demand.get(k);
    for (const i of new Set([...Object.keys(s || {}), ...Object.keys(d || {})])) { items[i] = names.item(i); io.push({ i, s: s?.[i] ? round(s[i]) : undefined, d: d?.[i] ? round(d[i]) : undefined }); }
    const kind = t ?? gkind(o);
    nodes.push({
      t: kind, c: o.virtual ? '' : cls(o), n: kind === 'start' ? 'Open belt start' : kind === 'end' ? (pipe ? 'Open pipe end' : 'Open belt end') : names.building(o),
      r: o.virtual ? (o.on ? `on ${names.building(o.on)}` : undefined) : names.recipe(o) || undefined, id: sid(k), at: xyz(o),
      z: pipe ? Math.round(o.transform!.translation.z / 10) / 10 : undefined, clk: power.pinfo.has(k) ? round(clockOf(o)) : undefined, io: io.length ? io : undefined,
    });
    return id;
  };
  for (const k of members) if (!chainPart(k)) addNode(k);
  const seen = new Set<string>(); const edgeKey = new Set<string>();
  const finish = (a: number, b: number, parts: string[]) => {
    const objs = parts.map(p => idx.at(p));
    const caps = objs.map(o => pipe ? lg.pipeCap(o) : lg.beltCap(o)).filter((c): c is number => c != null);
    const tiers = [...new Set(objs.map(o => { const C = cls(o); return pipe ? (/MK2/i.test(C) ? 'Mk2' : 'Mk1') : (C.match(/(Mk\d)/)?.[1] ?? ''); }))];
    const e = edges.length;
    edges.push({ a, b, cap: caps.length ? Math.min(...caps) : null, tier: tiers.join('+'), parts: parts.length, f: {}, z: pipe && objs.length ? Math.round(Math.max(...objs.map(o => lg.topZ(o))) / 10) / 10 : undefined });
    for (const p of parts) edgeOf.set(p, e);
  };
  const walk = (from: number, first: string, prev: string) => {
    const parts: string[] = []; let cur = first, last = prev;
    while (chainPart(cur) && !seen.has(cur)) {
      parts.push(cur); seen.add(cur);
      const nx = [...((pipe ? lg.pAdj.get(cur) : lg.bOut.get(cur)) || [])].filter(y => members.has(y) && y !== last);
      if (!nx.length) { const id = addNode(cur, 'end'); nodeOf.delete(cur); return finish(from, id, parts); }
      last = cur; cur = nx[0];
    }
    if (chainPart(cur)) return; // ran into a chain already walked from its other end (pipe loop)
    const to = nodeOf.get(cur); if (to === undefined) return;
    if (!parts.length) { const k = pipe ? [Math.min(from, to), Math.max(from, to)].join('-') : `${from}>${to}`; if (edgeKey.has(k)) return; edgeKey.add(k); }
    finish(from, to, parts);
  };
  const heads: [string, string][] = [];
  const walkFrom = (k: string) => {
    const from = nodeOf.get(k)!;
    for (const y of (pipe ? lg.pAdj.get(k) : lg.bOut.get(k)) || []) if (members.has(y) && !(pipe && chainPart(y) && seen.has(y))) {
      if (!pipe && n.terminals.has(k) && n.terminals.has(y) && n.transport.length) continue; // the solver skips these too
      const before = edges.length; walk(from, y, k); if (edges.length > before) heads[before] = [k, y];
    }
  };
  for (const k of [...nodeOf.keys()]) walkFrom(k);
  // belt chains that start open (nothing feeds them)
  for (const k of members) if (chainPart(k) && !seen.has(k) && !pipe && ![...(lg.bIn.get(k) || [])].some(y => members.has(y))) {
    const id = addNode(k, 'start'); nodeOf.delete(k); const before = edges.length; walk(id, k, ''); if (edges.length > before) heads[before] = ['', k];
  }
  return { graph: { kind: n.kind, label: '', sev: 'ok', nodes, edges, items }, nodeOf, edgeOf, heads };
}

/** Pipes are undirected: orient each edge along the flow the solver found (or away from the producers). */
export function orientPipeDiagram(G: NetGraph) {
  const adj: number[][] = G.nodes.map(() => []);
  G.edges.forEach(e => { adj[e.a].push(e.b); adj[e.b].push(e.a); });
  const dist = G.nodes.map(() => Infinity); const q: number[] = [];
  G.nodes.forEach((x, i) => { if (x.io?.some(v => v.s) || x.t === 'pump') { dist[i] = 0; q.push(i); } });
  for (let i = 0; i < q.length; i++) for (const y of adj[q[i]]) if (dist[y] === Infinity) { dist[y] = dist[q[i]] + 1; q.push(y); }
  for (const e of G.edges) {
    const tot = Object.values(e.f).reduce((a, b) => a + b, 0);
    if (tot < -1e-6 || (Math.abs(tot) <= 1e-6 && dist[e.b] < dist[e.a])) { [e.a, e.b] = [e.b, e.a]; for (const k in e.f) e.f[k] = -e.f[k]; }
  }
}
