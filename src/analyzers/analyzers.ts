// Every analyzer, in the order their issues are listed.
import type { SatisfactorySave } from '../model/satisfactory_save';
import type { Analyzer, CheckDoc, Issue } from './types';
import { BELT_ANALYZER } from './belts';
import { PIPE_ANALYZER } from './pipes';
import { COAL_PLANT_ANALYZER } from './coal_plant';
import { POWER_BALANCE_ANALYZER } from './power_balance';
import { BLUEPRINT_CONNECTIONS_ANALYZER } from './blueprint_connections';
import { BLUEPRINT_POWER_ANALYZER } from './blueprint_power';

export const ANALYZERS: Analyzer[] = [
  BELT_ANALYZER,
  PIPE_ANALYZER,
  COAL_PLANT_ANALYZER,
  POWER_BALANCE_ANALYZER,
  BLUEPRINT_CONNECTIONS_ANALYZER,
  BLUEPRINT_POWER_ANALYZER,
];

export interface AnalysisResult {
  issues: Issue[];
  /** Docs of every check the analyzers that ran can raise, by code. */
  checks: Record<string, CheckDoc>;
}

/** Runs the analyzers that apply to this kind of file. */
export function runAnalyzers(save: SatisfactorySave, analyzers: Analyzer[] = ANALYZERS): AnalysisResult {
  const issues: Issue[] = []; const checks: Record<string, CheckDoc> = {};
  for (const a of analyzers) {
    if (!a.targets.includes(save.kind)) continue;
    Object.assign(checks, a.checks);
    issues.push(...a.run(save));
  }
  return { issues, checks };
}
