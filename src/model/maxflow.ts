// Dinic max-flow on a small graph. Node ids are 0..n-1.
export class FlowGraph {
  private head: number[][] = [];
  private to: number[] = [];
  private cap: number[] = [];
  constructor(public n: number) {
    for (let i = 0; i < n; i++) this.head.push([]);
  }
  addNode(): number { this.head.push([]); return this.n++; }
  /** Adds u->v with capacity c, returns edge index (its reverse is idx ^ 1). */
  addEdge(u: number, v: number, c: number): number {
    const e = this.to.length;
    this.head[u].push(e); this.to.push(v); this.cap.push(c);
    this.head[v].push(e + 1); this.to.push(u); this.cap.push(0);
    return e;
  }
  residual(e: number) { return this.cap[e]; }
  /** No more flow through e (what already went through stays). */
  freeze(e: number) { this.cap[e] = 0; }

  maxflow(s: number, t: number): number {
    const EPS = 1e-9;
    let flow = 0;
    const lvl = new Int32Array(this.n);
    const it = new Int32Array(this.n);
    for (;;) {
      lvl.fill(-1); lvl[s] = 0;
      const q = [s];
      for (let i = 0; i < q.length; i++) {
        const u = q[i];
        for (const e of this.head[u]) if (this.cap[e] > EPS && lvl[this.to[e]] < 0) { lvl[this.to[e]] = lvl[u] + 1; q.push(this.to[e]); }
      }
      if (lvl[t] < 0) return flow;
      it.fill(0);
      // iterative DFS to avoid deep recursion on long belt chains
      for (;;) {
        const stack: number[] = [s]; const edges: number[] = [];
        let found = false;
        while (stack.length) {
          const u = stack[stack.length - 1];
          if (u === t) { found = true; break; }
          let advanced = false;
          for (; it[u] < this.head[u].length; it[u]++) {
            const e = this.head[u][it[u]], v = this.to[e];
            if (this.cap[e] > EPS && lvl[v] === lvl[u] + 1) { stack.push(v); edges.push(e); advanced = true; break; }
          }
          if (!advanced) { lvl[u] = -1; stack.pop(); if (edges.length) { const pe = edges.pop()!; it[this.to[pe ^ 1]]++; } }
        }
        if (!found) break;
        let f = Infinity;
        for (const e of edges) f = Math.min(f, this.cap[e]);
        if (!isFinite(f)) f = 1e12;
        for (const e of edges) { this.cap[e] -= f; this.cap[e ^ 1] += f; }
        flow += f;
      }
    }
  }

  /** Nodes reachable from s in the residual graph (call after maxflow) -> source side of a min cut. */
  reachable(s: number): Uint8Array {
    const seen = new Uint8Array(this.n); seen[s] = 1; const q = [s];
    for (let i = 0; i < q.length; i++) for (const e of this.head[q[i]]) if (this.cap[e] > 1e-9 && !seen[this.to[e]]) { seen[this.to[e]] = 1; q.push(this.to[e]); }
    return seen;
  }
}
