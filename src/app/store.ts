// Page state: one small store shared by the loaders and the components (useSyncExternalStore).
import { useSyncExternalStore } from 'react';
import type { BlueprintReport, CheckDoc, Issue, NetGraph, SaveReport } from '../report/types';
import { PREF, readPref, writePref } from './lib/storage';

export type ViewName = 'switches' | 'aggregated' | 'blueprints';
export type AggTab = 'machines' | 'fix';

/** What the issue / network modal shows: a list of issues to page through, or one network diagram. */
export interface ModalSpec {
  issues?: Issue[];
  net?: number;
  graphs: NetGraph[];
  checks: Record<string, CheckDoc>;
  /** Blueprint coordinates are local: shown as plain text, not as map links. */
  plain: boolean;
  label?: string;
  idx: number;
}

/** A file loaded from a URL (live reload status). */
export interface RemoteStatus { what: string; url: string; checked: number; fail: string }

export interface AppState {
  report: SaveReport | null;
  blueprints: BlueprintReport[];
  view: ViewName;
  aggTab: AggTab;
  /** Open drawer: a card key, or "bp:<index>". */
  open: string | null;
  modal: ModalSpec | null;
  loading: { p: number; msg: string } | null;
  error: string | null;
  /** Power cost multiplier for blueprints set by the user (null = from the save, or 1). */
  bpMult: number | null;
  live: boolean;
  remotes: RemoteStatus[];
  /** Game icons available under icons/ (src/static/icons/index.json). */
  icons: ReadonlySet<string>;
}

const initialMult = (() => { const v = parseFloat(readPref(PREF.bpMult) || ''); return v > 0 ? v : null; })();
let state: AppState = {
  report: null, blueprints: [], view: 'switches', aggTab: 'machines', open: null, modal: null, loading: null, error: null,
  bpMult: initialMult, live: false, remotes: [], icons: new Set(),
};
const listeners = new Set<() => void>();

export const getState = () => state;
export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach(l => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state));
}

export const hasData = (s: AppState) => !!s.report || s.blueprints.length > 0;
export const powerMult = (s: AppState) => s.bpMult ?? s.report?.powerMult ?? 1;
export function setBpMult(v: number | null) { writePref(PREF.bpMult, v ? String(v) : null); setState({ bpMult: v }); }

// ---------------------------------------------------------------- routing (#switches, #aggregated, #fix, #blueprints)
export function applyHash() {
  const h = location.hash.slice(1);
  if (h === 'switches') setState({ view: 'switches' });
  else if (h === 'fix') setState({ view: 'aggregated', aggTab: 'fix' });
  else if (h === 'aggregated') setState({ view: 'aggregated', aggTab: 'machines' });
  else if (h === 'blueprints') setState({ view: 'blueprints' });
}
export const go = (hash: string) => { if (location.hash === `#${hash}`) applyHash(); else location.hash = hash; };
