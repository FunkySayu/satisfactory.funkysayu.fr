// Parse -> model -> analyzers -> report. Used by the web worker and by the Node scripts.
import { parseSatisfactorySave, type GameData, type NetSeverity, type NetSummary, type ParseOptions, type SatisfactorySave, type SaveInput } from '../model/satisfactory_save';
import { runAnalyzers, type AnalysisResult } from '../analyzers/analyzers';
import type { Issue } from '../analyzers/types';
import type { BlueprintReport, Card, SaveReport } from './types';

const ISSUE_ORDER = { error: 0, warn: 1, info: 2 } as const;
const SEV_ORDER = { error: 0, warn: 1, ok: 2 } as const;
const bySev = (a: Issue, b: Issue) => ISSUE_ORDER[a.sev] - ISSUE_ORDER[b.sev];
const byNetSev = (a: NetSummary, b: NetSummary) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev];
export const severityOf = (l: Issue[]): NetSeverity => l.some(i => i.sev === 'error') ? 'error' : l.some(i => i.sev === 'warn') ? 'warn' : 'ok';

export function analyzeFile(input: SaveInput, gd: GameData, opts: ParseOptions = {}): SaveReport | BlueprintReport {
  const t0 = Date.now();
  const save = parseSatisfactorySave(input, gd, opts);
  const analysis = runAnalyzers(save);
  return save.kind === 'save' ? buildSaveReport(save, analysis, Date.now() - t0) : buildBlueprintReport(save, analysis);
}

/** Issues by what they are about, and each network's severity from its own issues. */
function distribute(save: SatisfactorySave, issues: Issue[]) {
  const byBuilding = new Map<string, Issue[]>(), byNet = new Map<number, Issue[]>(), byCircuit = new Map<string, Issue[]>();
  const add = <K>(m: Map<K, Issue[]>, k: K, i: Issue) => { (m.get(k) ?? m.set(k, []).get(k)!).push(i); };
  for (const i of issues) {
    const s = i.subject;
    if (s.kind === 'building') add(byBuilding, s.name, i);
    else if (s.kind === 'network') add(byNet, s.index, i);
    else if (s.kind === 'circuit') add(byCircuit, s.key, i);
  }
  for (const n of save.networks.all) n.summary.sev = n.graph.sev = severityOf(byNet.get(n.index) || []);
  return { byBuilding, byNet, byCircuit };
}

/** Unique ids so the page can find an issue again. */
function tagIssues(lists: Issue[][]) {
  let uid = 0; const seen = new Set<Issue>();
  for (const l of lists) for (const i of l) if (!seen.has(i)) { seen.add(i); i.uid = ++uid; }
}

export function buildSaveReport(save: SatisfactorySave, { issues, checks }: AnalysisResult, ms = 0): SaveReport {
  const { byBuilding, byNet, byCircuit } = distribute(save, issues);
  const all = save.networks.all; // network index = position
  const cards: Card[] = save.circuits.map(({ members, ...c }) => {
    // a circuit shows the issues of its own machines, of the networks they sit on, and of the other machines on those
    const set = new Set<Issue>(); const belts = new Set<number>(), pipes = new Set<number>();
    for (const b of members) {
      for (const i of byBuilding.get(b) || []) set.add(i);
      for (const n of save.networks.of(b)) (n.kind === 'belt' ? belts : pipes).add(n.index);
    }
    const nets = [...belts, ...pipes].map(i => all[i]);
    for (const n of nets) { for (const i of byNet.get(n.index) || []) set.add(i); for (const t of n.terminals) for (const i of byBuilding.get(t) || []) set.add(i); }
    const list = [...(byCircuit.get(c.key) || []), ...[...set].sort(bySev)];
    return {
      ...c, issues: list, severity: severityOf(list),
      belts: nets.filter(n => n.kind === 'belt').map(n => n.summary).sort(byNetSev),
      pipes: nets.filter(n => n.kind === 'pipe').map(n => n.summary).sort(byNetSev),
    };
  });
  tagIssues(cards.map(c => c.issues));
  return {
    kind: 'save', meta: save.meta!, cards, live: save.live, counts: save.counts, machines: save.machines, sloops: save.sloops,
    depotStored: save.depotStored, graphs: save.networks.graphs, powerMult: Math.round(save.power.powerMult * 100) / 100, checks, ms: ms || save.ms.parse + save.ms.model,
  };
}

export function buildBlueprintReport(save: SatisfactorySave, { issues, checks }: AnalysisResult, folder = ''): BlueprintReport {
  distribute(save, issues);
  const { powerGroups, unwired, ...bp } = save.blueprint!;
  const all = [...issues].sort(bySev);
  tagIssues([all]);
  return {
    kind: 'blueprint', folder, ...bp, issues: all, severity: severityOf(all),
    belts: save.networks.belts.map(n => n.summary).sort(byNetSev), pipes: save.networks.pipes.map(n => n.summary).sort(byNetSev),
    graphs: save.networks.graphs, counts: { objects: save.counts.objects, beltNets: save.counts.beltNets, pipeNets: save.counts.pipeNets }, checks,
  };
}

/** Placeholder for a blueprint whose files could not be read. */
export function failedBlueprint(name: string, folder: string, error: string): BlueprintReport {
  return {
    kind: 'blueprint', name, folder, desc: '', dims: [], error, issues: [], severity: 'error', belts: [], pipes: [], graphs: [], io: [], rows: [], ports: [],
    power: { draw: 0, gen: 0, machines: 0, nets: 0, unwired: 0 }, counts: {}, checks: {},
  };
}
