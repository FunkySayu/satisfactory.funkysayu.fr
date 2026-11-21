// What the page shows: plain, serializable reports built from the model and the analyzers' issues.
import type {
  BlueprintInfo, Circuit, MachineRow, NetGraph, NetSeverity, NetSummary, PowerSum, SaveMeta, SloopCount, StoredItem,
} from '../model/satisfactory_save';
import type { CheckDoc, Issue } from '../analyzers/types';

export type { BlueprintIO, BlueprintPort, BlueprintRow, Circuit, DepotFlow, GEdge, GKind, GNode, MachineRow, NetGraph, NetSeverity, NetSummary, PowerSum, SaveMeta } from '../model/satisfactory_save';
export type { CheckDoc, Issue, Severity, Category, View } from '../analyzers/types';

/** A circuit with the issues found on its machines and on the networks they sit on. */
export interface Card extends Omit<Circuit, 'members'> {
  issues: Issue[];
  severity: NetSeverity;
  belts: NetSummary[];
  pipes: NetSummary[];
}

export interface SaveReport {
  kind: 'save';
  meta: SaveMeta;
  cards: Card[];
  /** Main grid with switches as they are. */
  live: PowerSum;
  counts: Record<string, number>;
  machines: MachineRow[];
  sloops: SloopCount;
  depotStored: StoredItem[];
  graphs: NetGraph[];
  /** World power cost multiplier inferred from running machines. */
  powerMult: number;
  checks: Record<string, CheckDoc>;
  ms: number;
}

/** One checked blueprint. Power is at a x1 power cost (the page scales it). */
export interface BlueprintReport extends Omit<BlueprintInfo, 'powerGroups' | 'unwired'> {
  kind: 'blueprint';
  /** Folder (blueprint session) it was loaded from. */
  folder: string;
  issues: Issue[];
  severity: NetSeverity;
  belts: NetSummary[];
  pipes: NetSummary[];
  graphs: NetGraph[];
  counts: Record<string, number>;
  checks: Record<string, CheckDoc>;
  /** Set when the files could not be read. */
  error?: string;
}

/** A pre-computed report the page can open with ?snapshot=<url> (written by scratch/scripts/snapshot.ts). */
export interface Snapshot { report: SaveReport | null; blueprints: BlueprintReport[]; view?: string }
