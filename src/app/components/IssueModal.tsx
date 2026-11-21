// Details of an issue (what it means, how to fix it, the network diagrams involved) or of one network.
import { useEffect, useRef, useState } from 'react';
import type { CheckDoc, Issue, NetGraph, View } from '../../report/types';
import { plural } from '../lib/format';
import { setState, useApp, type ModalSpec } from '../store';
import { NetworkDiagram, NodeDetail } from '../diagram/NetworkDiagram';
import { GameIcon, NetIcon, SevIcon } from './icons';
import { MachineTable } from './MachineTable';
import { CloseButton, Coords, Eyebrow, PlainCoords, PowerTable } from './ui';

const close = () => setState({ modal: null });
const checkOf = (i: Issue, checks: Record<string, CheckDoc>): CheckDoc =>
  checks[i.code] ?? { title: i.cat === 'belt' ? 'Belt check' : i.cat === 'pipe' ? 'Pipe check' : 'Check', why: '', fix: '' };

function Legend() {
  const line = (cls: string) => <i className={`inline-block w-[18px] h-0 border-t-[3px] ${cls}`} />;
  const box = (cls: string) => <i className={`inline-block w-3.5 h-2.5 rounded-[2px] border-2 ${cls}`} />;
  const items: [React.ReactNode, string][] = [
    [line('border-edge'), 'flow / capacity per min'], [line('border-err'), 'bottleneck'], [line('border-warn'), 'may be overloaded'],
    [<i className="inline-block w-[18px] h-0 border-t-2 border-dashed border-faint" />, 'no flow'], [line('border-hl'), 'highlighted'],
    [box('border-err'), 'short of input'], [box('border-warn'), 'output backs up'],
  ];
  return <div className="flex flex-wrap gap-x-3.5 gap-y-[3px] text-xs text-muted">{items.map(([g, t]) => <span key={t} className="inline-flex items-center gap-[5px]">{g}{t}</span>)}</div>;
}

function NetSection({ g, view }: { g: NetGraph; view?: View }) {
  const [sel, setSel] = useState<number | undefined>();
  return (
    <section className="grid gap-2">
      <h3 className="mt-1.5 font-head font-semibold text-base/[1.3] flex gap-2 items-center flex-wrap">
        <NetIcon />{g.kind === 'belt' ? 'Belt' : 'Pipe'} network
        <span className="inline-flex gap-1 items-center font-medium">{Object.keys(g.items).map(k => <GameIcon key={k} k={k} />)}{g.label}</span>
        <span className="sub">{plural(g.nodes.length, 'node')}{g.extra ? ` · ${g.extra}` : ''}</span>
      </h3>
      <Legend />
      <NetworkDiagram g={g} focus={view} selected={sel} onSelect={setSel} />
      <div className="text-[13.5px] grid gap-2 min-h-7">
        {sel != null ? <NodeDetail g={g} i={sel} onSelect={setSel} /> : <p className="sub m-0">Drag to pan, scroll to zoom. Click a machine, splitter or junction to see what it gets and where it sends it.</p>}
      </div>
    </section>
  );
}

function ModalBody({ spec }: { spec: ModalSpec }) {
  const report = useApp(s => s.report);
  const iss = spec.issues?.[spec.idx];
  const views: View[] = iss ? (iss.views ?? []) : spec.net != null ? [{ g: spec.net }] : [];
  const g0 = spec.net != null ? spec.graphs[spec.net] : null;
  const chk = iss ? checkOf(iss, spec.checks) : null;
  const n = spec.issues?.length ?? 0;
  const card = iss?.card ? report?.cards.find(c => c.key === iss.card) : undefined;
  const gens = card ? report!.machines.filter(m => m.c === card.key && (m.gen > 0 || m.maxGen > 0)) : [];
  const page = (d: number) => setState(s => s.modal ? { modal: { ...s.modal, idx: Math.max(0, Math.min(n - 1, s.modal.idx + d)) } } : {});
  const closeRef = useRef<HTMLDivElement>(null);
  useEffect(() => { closeRef.current?.querySelector('button')?.focus(); }, []);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="m-title" onClick={e => e.stopPropagation()}
      className="w-[min(1240px,100%)] max-h-[calc(100vh-24px)] overflow-auto bg-panel border border-line rounded-md shadow-panel px-5 pt-4 pb-[22px] max-sm:px-3.5 max-sm:pt-3 grid gap-3 content-start">
      <header className="flex gap-2.5 items-start">
        {iss ? <SevIcon sev={iss.sev} className="size-[22px] mt-1" /> : <NetIcon className="size-[22px] mt-1" />}
        <div className="flex-1 min-w-0">
          <Eyebrow>{iss ? `${iss.cat} check${spec.label ? ` · ${spec.label}` : ''}` : 'Network'}</Eyebrow>
          <h2 id="m-title" className="mt-0.5 font-head font-semibold text-[22px]/[1.2] max-sm:text-[19px] text-balance">{chk ? chk.title : `${g0?.kind === 'pipe' ? 'Pipe' : 'Belt'} network · ${g0?.label}`}</h2>
        </div>
        {n > 1 && (
          <span className="inline-flex items-center gap-1.5 font-mono font-medium text-sm whitespace-nowrap mt-1">
            <button type="button" className="btn px-[9px] py-0.5 leading-[1.3]" disabled={!spec.idx} onClick={() => page(-1)} aria-label="Previous">‹</button>
            {spec.idx + 1} of {n}
            <button type="button" className="btn px-[9px] py-0.5 leading-[1.3]" disabled={spec.idx >= n - 1} onClick={() => page(1)} aria-label="Next">›</button>
          </span>
        )}
        <div ref={closeRef}><CloseButton onClick={close} /></div>
      </header>
      {iss && <p className="m-0 text-base">{iss.msg}</p>}
      {chk && (chk.why || chk.fix) && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
          {chk.why && <div className="bg-panel-2 rounded px-3 py-2"><span className="label">What it means</span><p className="mt-[3px] text-[14px]">{chk.why}</p></div>}
          {chk.fix && <div className="bg-panel-2 rounded px-3 py-2"><span className="label">How to fix</span><p className="mt-[3px] text-[14px]">{chk.fix}</p></div>}
        </div>
      )}
      {iss && (iss.kv?.length || iss.at || iss.bp) && (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-[3px] m-0 text-[13.5px]">
          {(iss.kv || []).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="m-0 [overflow-wrap:anywhere]">{v}</dd></div>)}
          {iss.at && <><dt className="text-muted">Location</dt><dd className="m-0"><Coords at={iss.at} /></dd></>}
          {iss.bp && <><dt className="text-muted">Blueprint</dt><dd className="m-0">{iss.bp}</dd></>}
        </dl>
      )}
      {card && <>
        <div className="text-[13.5px]"><PowerTable p={card.power} /></div>
        <h3 className="mt-1.5 font-head font-semibold text-base">Generators in {card.name}</h3>
        <MachineTable rows={gens} withCircuit={false} />
      </>}
      {views.map((v, vi) => spec.graphs[v.g] ? <NetSection key={`${spec.idx}-${vi}-${v.g}`} g={spec.graphs[v.g]} view={v} /> : null)}
      {iss && !views.length && !card && <p className="sub m-0">No belt or pipe network is involved in this check.</p>}
    </div>
  );
}

export function IssueModal() {
  const spec = useApp(s => s.modal);
  if (!spec) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/50 grid place-items-center px-3 pb-3 pt-[max(12px,env(safe-area-inset-top))]" onClick={close}>
      <PlainCoords.Provider value={spec.plain}><ModalBody spec={spec} /></PlainCoords.Provider>
    </div>
  );
}
