// Types shared by every analyzer.
import type { SatisfactorySave } from '../model/satisfactory_save';

export type Severity = 'error' | 'warn' | 'info';
export type Category = 'coal' | 'belt' | 'pipe' | 'power' | 'build';

/** Part of a network diagram to show for an issue: graph index + highlighted nodes / edges. */
export interface View { g: number; n?: number[]; e?: number[] }

/** What an issue is about. It decides where the issue is listed: a building's issues show on the circuit it is
 *  wired to and on the circuits of the networks it sits on; a network's on every circuit it serves. */
export type Subject =
  | { kind: 'building'; name: string }
  | { kind: 'network'; index: number }
  | { kind: 'circuit'; key: string }
  | { kind: 'save' };

export interface Issue {
  sev: Severity;
  cat: Category;
  /** Check that raised it, e.g. "belt.bottleneck" (documented in its analyzer's checks). */
  code: string;
  msg: string;
  subject: Subject;
  /** Position (m) and short id of the building the message points at. */
  at?: number[];
  id?: string;
  /** Unique within one report (set when the report is built). */
  uid?: number;
  /** Network diagrams that show the problem. */
  views?: View[];
  /** Building details. */
  kv?: [string, string][];
  /** Circuit the issue is about (power checks). */
  card?: string;
  /** Name of the blueprint the anchor building was placed from (saves only). */
  bp?: string;
}

/** What a check means and how to fix it (shown with each issue). */
export interface CheckDoc { title: string; why: string; fix: string }

export interface Analyzer {
  id: string;
  name: string;
  description: string;
  /** Kinds of file the analyzer runs on. */
  targets: SatisfactorySave['kind'][];
  /** Every code the analyzer can raise. */
  checks: Record<string, CheckDoc>;
  run(save: SatisfactorySave): Issue[];
}
