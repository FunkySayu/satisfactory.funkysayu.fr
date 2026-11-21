// Belt / pipe network diagram layout: layered left-to-right (what feeds what, where it splits and merges).
// Cycle breaking, longest-path layers, dummy nodes for long edges, barycenter ordering, then isotonic placement
// (each node as close as it can to the median of its neighbours).
import type { GNode, NetGraph } from '../../report/types';

export const BOX = new Set(['m', 'store', 'sink', 'ext']);
export const ROUND = new Set(['split', 'merge', 'junc', 'pump', 'valve']);
const size = (n: GNode) => BOX.has(n.t) ? [184, 58] : ROUND.has(n.t) ? [32, 32] : [46, 22];
const GAP_Y = 16, GAP_X = 124, PAD = 24;

/** Flows per node computed from the edges: what reaches each consumer, what leaves each producer. */
export function nodeFlows(g: NetGraph) {
  const inF = g.nodes.map(() => ({} as Record<string, number>)), outF = g.nodes.map(() => ({} as Record<string, number>));
  for (const e of g.edges) for (const [i, f] of Object.entries(e.f)) { outF[e.a][i] = (outF[e.a][i] || 0) + f; inF[e.b][i] = (inF[e.b][i] || 0) + f; }
  return { inF, outF };
}

export interface Laid { x: number; y: number; w: number; h: number }
export interface Layout { laid: Laid[]; pts: [number, number][][]; back: Set<number>; W: number; H: number }
export function layout(g: NetGraph): Layout {
  const N = g.nodes.length;
  const out: number[][] = Array.from({ length: N }, () => []), inn: number[][] = Array.from({ length: N }, () => []);
  g.edges.forEach((e, i) => { if (e.a !== e.b) { out[e.a].push(i); inn[e.b].push(i); } });
  // 1. cycle breaking: DFS, edges to a node on the stack are back edges
  const back = new Set<number>(); const state = new Uint8Array(N);
  const roots = [...Array(N).keys()].sort((a, b) => inn[a].length - inn[b].length);
  for (const r of roots) { if (state[r]) continue;
    const st: [number, number][] = [[r, 0]]; state[r] = 1;
    while (st.length) { const top = st[st.length - 1]; const [v, k] = top;
      if (k >= out[v].length) { state[v] = 2; st.pop(); continue; } top[1]++;
      const e = out[v][k], w = g.edges[e].b;
      if (state[w] === 1) back.add(e); else if (!state[w]) { state[w] = 1; st.push([w, 0]); } } }
  const fwd = (e: number) => !back.has(e) && g.edges[e].a !== g.edges[e].b;
  // 2. longest-path layers
  const layer = new Array(N).fill(0); const indeg = new Array(N).fill(0);
  g.edges.forEach((e, i) => { if (fwd(i)) indeg[e.b]++; });
  const q = [...Array(N).keys()].filter(v => !indeg[v]);
  for (let i = 0; i < q.length; i++) for (const e of out[q[i]]) if (fwd(e)) { const w = g.edges[e].b; layer[w] = Math.max(layer[w], layer[q[i]] + 1); if (!--indeg[w]) q.push(w); }
  // sources sit right before their first consumer (an input merged in late does not start at the far left)
  for (let pass = 0; pass < 2; pass++) for (let v = 0; v < N; v++) if (!inn[v].some(fwd) && out[v].some(fwd)) layer[v] = Math.max(layer[v], Math.min(...out[v].filter(fwd).map(e => layer[g.edges[e].b])) - 1);
  // 3. dummy nodes along long edges
  type V = { id: number; real: boolean; w: number; h: number; layer: number };
  const vs: V[] = g.nodes.map((n, i) => { const [w, h] = size(n); return { id: i, real: true, w, h, layer: layer[i] }; });
  const chains: number[][] = []; // per edge: virtual node ids from a to b
  const vout: number[][] = vs.map(() => []), vin: number[][] = vs.map(() => []);
  const link = (a: number, b: number) => { vout[a].push(b); vin[b].push(a); };
  g.edges.forEach((e, i) => {
    if (!fwd(i)) { chains[i] = [e.a, e.b]; return; }
    const c = [e.a]; for (let l = layer[e.a] + 1; l < layer[e.b]; l++) { const d = vs.length; vs.push({ id: d, real: false, w: 0, h: 6, layer: l }); vout.push([]); vin.push([]); link(c[c.length - 1], d); c.push(d); }
    link(c[c.length - 1], e.b); c.push(e.b); chains[i] = c;
  });
  const L = Math.max(0, ...vs.map(v => v.layer)) + 1;
  const layers: number[][] = Array.from({ length: L }, () => []);
  // initial order: depth-first from the sources so connected parts stay together
  const seen = new Uint8Array(vs.length); const dfsOrder: number[] = [];
  const visit = (v: number) => { const st = [v]; while (st.length) { const x = st.pop()!; if (seen[x]) continue; seen[x] = 1; dfsOrder.push(x); for (const y of [...vout[x]].reverse()) if (!seen[y]) st.push(y); } };
  for (const v of vs.map(v => v.id).filter(v => !vin[v].length)) visit(v);
  for (const v of vs) visit(v.id);
  for (const v of dfsOrder) layers[vs[v].layer].push(v);
  // 4. barycenter ordering
  const pos = new Array(vs.length).fill(0); const setPos = () => layers.forEach(l => l.forEach((v, i) => { pos[v] = i; }));
  setPos();
  const bary = (l: number[], nb: number[][]) => { const b = l.map(v => nb[v].length ? nb[v].reduce((a, u) => a + pos[u], 0) / nb[v].length : pos[v]);
    const idx = l.map((_, i) => i).sort((i, j) => b[i] - b[j] || i - j); return idx.map(i => l[i]); };
  for (let it = 0; it < 8; it++) {
    if (it % 2 === 0) for (let l = 1; l < L; l++) { layers[l] = bary(layers[l], vin); setPos(); }
    else for (let l = L - 2; l >= 0; l--) { layers[l] = bary(layers[l], vout); setPos(); }
  }
  for (let l = 1; l < L; l++) { layers[l] = bary(layers[l], vin); setPos(); }
  // 5. coordinates: x per layer, y by isotonic regression towards the neighbours' median
  const colW = layers.map(l => Math.max(8, ...l.map(v => vs[v].w)));
  const xs: number[] = []; let acc = PAD; for (let l = 0; l < L; l++) { xs.push(acc + colW[l] / 2); acc += colW[l] + GAP_X; }
  const y = new Array(vs.length).fill(0);
  for (const l of layers) { let t = 0; for (const v of l) { y[v] = t + vs[v].h / 2; t += vs[v].h + GAP_Y; } }
  const place = (l: number[], want: (v: number) => number) => {
    // offsets o_i so that y_i = c_i + o_i with c nondecreasing keeps the gaps; PAV on (want - o)
    const o: number[] = []; let t = 0; l.forEach((v, i) => { if (i) t += (vs[l[i - 1]].h + vs[v].h) / 2 + GAP_Y; o.push(t); });
    // weighted: nodes that pass items on (splitter chains, long edges) keep their line, machines hanging off them move
    const wt = (v: number) => !vs[v].real ? 12 : vin[v].length && vout[v].length ? 20 : 1;
    const blocks: { s: number; n: number; w: number; m: number }[] = [];
    l.forEach((v, i) => { blocks.push({ s: i, n: 1, w: wt(v), m: want(v) - o[i] });
      while (blocks.length > 1 && blocks[blocks.length - 2].m > blocks[blocks.length - 1].m) { const b = blocks.pop()!, a = blocks[blocks.length - 1]; a.m = (a.m * a.w + b.m * b.w) / (a.w + b.w); a.n += b.n; a.w += b.w; } });
    for (const b of blocks) for (let i = b.s; i < b.s + b.n; i++) y[l[i]] = b.m + o[i];
  };
  const median = (a: number[]) => { const s = [...a].sort((p, q) => p - q); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
  for (let it = 0; it < 6; it++) {
    const nb = it % 2 ? vout : vin; const order = it % 2 ? [...layers.keys()].reverse() : [...layers.keys()];
    for (const l of order) place(layers[l], v => nb[v].length ? median(nb[v].map(u => y[u])) : y[v]);
  }
  for (const l of layers.keys()) place(layers[l], v => { const all = [...vin[v], ...vout[v]]; return all.length ? median(all.map(u => y[u])) : y[v]; });
  const minY = Math.min(...vs.map(v => y[v.id] - v.h / 2)); for (const v of vs) y[v.id] += PAD - minY;
  const H = Math.max(...vs.map(v => y[v.id] + v.h / 2)) + PAD + (back.size ? 40 : 0), W = acc - GAP_X + PAD;
  const laid: Laid[] = g.nodes.map((_, i) => ({ x: xs[vs[i].layer], y: y[i], w: vs[i].w, h: vs[i].h }));
  const pts = chains.map(c => c.map(v => [xs[vs[v].layer], y[v]] as [number, number]));
  return { laid, pts, back, W: Math.max(W, 200), H: Math.max(H, 80) };
}
