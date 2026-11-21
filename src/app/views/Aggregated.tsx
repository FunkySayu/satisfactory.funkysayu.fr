// Aggregated view: every powered machine of the save, and the list of everything to fix.
import { useMemo, useState } from 'react';
import type { Card, Issue, SaveReport } from '../../report/types';
import { issueKey, issueTemplate } from '../lib/format';
import { readDone, writeDone } from '../lib/storage';
import { go, setState } from '../store';
import { MachineTable } from '../components/MachineTable';
import { CategoryTag, IssueLink, openIssues } from '../components/Issues';
import { OkIcon, SevIcon } from '../components/icons';
import { Coords, Count, SevBadges } from '../components/ui';

const hint = 'm-0 text-muted text-sm';

export function Aggregated({ report, tab }: { report: SaveReport; tab: 'machines' | 'fix' }) {
  const fixCount = useMemo(() => fixTotal(report), [report]);
  const sub = (id: 'machines' | 'fix', label: React.ReactNode) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => go(id === 'fix' ? 'fix' : 'aggregated')}
      className={`border-0 border-b-2 bg-transparent px-3 pt-1.5 pb-[7px] -mb-px cursor-pointer font-medium inline-flex gap-1.5 items-center ${tab === id ? 'text-fg border-fg' : 'text-muted border-transparent'}`}>{label}</button>
  );
  return (
    <div className="grid gap-3">
      <div className="flex gap-0.5 border-b border-line" role="tablist" aria-label="Aggregated view">
        {sub('machines', 'Machines')}{sub('fix', <>To fix <Count>{fixCount}</Count></>)}
      </div>
      {tab === 'machines'
        ? <div className="grid gap-2"><p className={hint}>Every powered building in the save, grouped by machine and recipe. Click a row to list each building and the circuit it is on. Power in MW.</p><MachineTable rows={report.machines} withCircuit /></div>
        : <FixList report={report} />}
    </div>
  );
}

/** Errors + warnings, each counted once even when several cards list it. */
export function fixTotal(r: SaveReport) {
  const s = new Set<string>(); for (const c of r.cards) for (const i of c.issues) if (i.sev !== 'info') s.add(issueKey(i)); return s.size;
}

interface Row { sev: Issue['sev']; cat: Issue['cat']; msg: string; ats: number[][]; key: string; items: Issue[] }

function FixList({ report }: { report: SaveReport }) {
  const [filter, setFilter] = useState({ error: true, warn: true, info: false });
  const [done, setDone] = useState(readDone);
  const toggleDone = (k: string, on: boolean) => { const s = new Set(done); on ? s.add(k) : s.delete(k); writeDone(s); setDone(s); };
  const { groups, counts } = useMemo(() => {
    // identical problems at several places collapse into one row; an issue listed on several cards shows once
    const seen = new Set<string>(); const counts = { error: 0, warn: 0, info: 0 };
    const groups: { c: Card; rows: Row[]; e: number; w: number }[] = [];
    const kindOrder = (c: Card) => c.kind === 'switch' ? 0 : c.kind === 'main' ? 1 : 2;
    for (const c of [...report.cards].sort((a, b) => kindOrder(a) - kindOrder(b) || (a.priority ?? 9) - (b.priority ?? 9) || a.name.localeCompare(b.name))) {
      const rows = new Map<string, Row>(); let e = 0, w = 0;
      for (const i of c.issues) {
        const k = issueKey(i); if (seen.has(k)) continue; seen.add(k); counts[i.sev]++;
        if (i.sev === 'error') e++; else if (i.sev === 'warn') w++;
        if (!filter[i.sev]) continue;
        const t = issueTemplate(i.msg); const rk = `${i.sev}|${t}`;
        const row = rows.get(rk) ?? rows.set(rk, { sev: i.sev, cat: i.cat, msg: t, ats: [], key: `${c.key}|${rk}`, items: [] }).get(rk)!;
        if (i.at) row.ats.push(i.at); row.items.push(i);
      }
      if (rows.size) groups.push({ c, rows: [...rows.values()], e, w });
    }
    groups.sort((a, b) => b.e - a.e || b.w - a.w);
    return { groups, counts };
  }, [report, filter]);
  const chip = (s: 'error' | 'warn' | 'info', label: string) => (
    <label className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] border border-line rounded-full bg-panel cursor-pointer font-medium tabular-nums ${filter[s] ? '' : 'opacity-55'}`}>
      <input type="checkbox" className="m-0 accent-fg" checked={filter[s]} onChange={e => setFilter(f => ({ ...f, [s]: e.target.checked }))} />
      <SevIcon sev={s} />{counts[s]} {label}
    </label>
  );
  const where = (ats: number[][]) => ats.length === 1 ? <Coords at={ats[0]} /> : ats.length ? (
    <details className="text-note text-muted max-w-[260px]">
      <summary className="cursor-pointer whitespace-nowrap font-mono text-right max-sm:text-left">{ats.length} places</summary>
      <div className="flex flex-wrap gap-1 justify-end max-sm:justify-start mt-1">{ats.map((a, k) => <Coords key={k} at={a} />)}</div>
    </details>) : null;
  const ctx = { graphs: report.graphs, checks: report.checks, plain: false };
  return (
    <div className="grid gap-3.5">
      <div className="flex items-center justify-between gap-2.5 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">{chip('error', 'errors')}{chip('warn', 'warnings')}{chip('info', 'notes')}</div>
        <p className={hint}>Click a problem for its diagram and details. Same problem at several places is one row. Ticks stay in this browser only.</p>
      </div>
      {groups.length ? groups.map(({ c, rows, e, w }) => (
        <section key={c.key} className="bg-panel rounded-[3px] overflow-hidden">
          <h3 className="m-0 px-3 py-2 bg-head flex gap-x-3 gap-y-1.5 items-baseline flex-wrap font-head font-semibold text-base/[1.25]">
            <button type="button" className="link" onClick={() => setState({ open: c.key })}>{c.name}</button>
            <span className="font-body font-normal text-sm text-muted">{c.kind === 'switch' ? `Group ${c.priority ?? '–'} · ${c.on ? 'On' : 'Off'}` : c.kind === 'main' ? 'Main grid' : 'Separate grid'}{c.quadrant ? ` · ${c.quadrant}` : ''}</span>
            <span className="ml-auto inline-flex"><SevBadges e={e} w={w} /></span>
          </h3>
          <ul className="list-none m-0 py-1">{rows.map(i => {
            const d = done.has(i.key);
            return (
              <li key={i.key} className="grid grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] max-sm:grid-cols-[auto_auto_minmax(0,1fr)] gap-2 items-start px-3 py-[7px] border-t border-line first:border-t-0">
                <input type="checkbox" className="mt-[3px] accent-pos" checked={d} onChange={e => toggleDone(i.key, e.target.checked)} aria-label="Mark as fixed" />
                <SevIcon sev={i.sev} className="mt-0.5" /><CategoryTag cat={i.cat} />
                <IssueLink done={d} onClick={() => openIssues({ ...ctx, label: c.name }, i.items)}>
                  {i.msg}{i.ats.length > 1 && <b className="font-mono font-semibold text-xs text-muted"> ×{i.ats.length}</b>}
                </IssueLink>
                <span className="max-sm:col-start-3 max-sm:justify-self-start">{where(i.ats)}</span>
              </li>);
          })}</ul>
        </section>
      )) : <p className="m-0 py-8 px-2 text-faint text-base flex gap-2 items-center justify-center"><OkIcon /> Nothing to fix with these filters.</p>}
    </div>
  );
}
