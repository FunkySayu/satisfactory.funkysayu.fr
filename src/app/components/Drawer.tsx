// Side drawer: everything about one circuit card, or one blueprint.
import type { ReactNode } from 'react';
import type { BlueprintReport, Card, SaveReport } from '../../report/types';
import { coords, mw, num, plural, signed, tally } from '../lib/format';
import { powerMult, setState, useApp } from '../store';
import { bpNet } from '../views/Blueprints';
import { AUGMENTER, GameIcon, MERCER, PowerGlyph, SLOOP } from './icons';
import { ChecksList, NetTable, type IssueContext } from './Issues';
import { MachineTable } from './MachineTable';
import { Tip } from './Tooltip';
import { boostPct, CloseButton, Coords, Count, Delta, Eyebrow, PlainCoords, PowerBar, Quadrant, SevBadges, useBlockMW } from './ui';

const close = () => setState({ open: null });
const H4 = ({ children }: { children: ReactNode }) => <h4 className="mt-2.5 font-head font-semibold text-[15px] flex gap-2 items-baseline">{children}</h4>;
function Kpis({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-4 max-sm:grid-cols-2 gap-px bg-line border border-line rounded-[3px] overflow-hidden [&>div]:bg-panel-2 [&>div]:px-3 [&>div]:py-2.5 [&>div]:grid [&>div]:gap-0.5 [&>div]:content-start [&>div]:min-w-0">{children}</div>;
}
const KpiValue = ({ children, className = '' }: { children: ReactNode; className?: string }) => <b className={`font-mono font-medium text-lg/[1.2] tabular-nums ${className}`}>{children}</b>;
function Head({ eyebrow, title, children }: { eyebrow: ReactNode; title: string; children?: ReactNode }) {
  return (
    <header className="flex justify-between gap-3 items-start">
      <div><Eyebrow>{eyebrow}</Eyebrow><h2 className="mt-0.5 mb-1.5 font-head font-semibold text-2xl/[1.15] text-balance">{title}</h2>{children}</div>
      <CloseButton onClick={close} />
    </header>
  );
}

function CardDrawer({ c, report }: { c: Card; report: SaveReport }) {
  const step = useBlockMW();
  const p = c.power; const rows = report.machines.filter(x => x.c === c.key); const [e, w] = tally(c.issues);
  const ctx: IssueContext = { graphs: report.graphs, checks: report.checks, plain: false, label: c.name };
  const sloopTxt = [...Object.entries(c.sloopBy).map(([k, v]) => `${v} in ${k}`), c.augmenters ? `${plural(c.augmenters, 'augmenter')} (${c.augmenters * 10} sloops)` : ''].filter(Boolean).join(', ') || 'none in this circuit';
  return <>
    <Head eyebrow={c.kind === 'switch' ? `Priority switch · ${c.priority ? `Group ${c.priority}` : 'Undefined'}` : c.kind === 'main' ? 'Main network' : 'Separate grid'} title={c.name}>
      <p className="m-0 flex gap-2 items-center flex-wrap">
        {c.kind === 'switch' && <span className="inline-flex items-center gap-[5px] font-semibold"><PowerGlyph on={!!c.on} />{c.on ? 'On' : 'Off'}</span>}
        <Quadrant c={c} />
        {c.pos && <><span className="sub">at</span><Coords at={c.pos} /></>}
        {c.parent && <span className="sub">fed from {c.parent}</span>}
      </p>
    </Head>
    {c.note && <p className="m-0 px-3 py-2 bg-panel-2 rounded-[3px] text-muted">{c.note}</p>}
    <Kpis>
      <div><span className="label">Generated</span><KpiValue>{mw(p.gen)}</KpiValue><span className="sub">max {mw(p.maxGen)} · {p.gens} gens{p.idleGens ? `, ${p.idleGens} idle` : ''}{p.boost ? ` · ${boostPct(p.boost)} augmenters` : ''}</span></div>
      <div><span className="label">Drawn</span><KpiValue>{mw(p.draw)}</KpiValue><span className="sub">max {mw(p.maxDraw)} · {p.consumers} consumers</span></div>
      <div><span className="label">Delta</span><KpiValue><Delta v={p} /></KpiValue><span className="mt-1"><PowerBar p={p} step={step} /></span>
        <span className="sub">{signed(p.maxGen - p.maxDraw)} at full load{c.nested.length > 0 && c.kind !== 'main' ? ` · own circuit ${signed(c.ownPower.gen - c.ownPower.draw)}` : ''}</span></div>
      <div><span className="label">Somersloops</span>
        <KpiValue className="inline-flex items-center gap-[3px] text-sloop"><GameIcon k={SLOOP} />{c.sloops}{c.augmenters > 0 && <span className="inline-flex items-center gap-[3px] text-fg ml-2"><GameIcon k={AUGMENTER} />{c.augmenters}</span>}</KpiValue>
        <span className="sub">{sloopTxt}</span></div>
    </Kpis>
    {c.nested.length > 0 && <>
      <H4>Nested switches</H4>
      <p className="m-0 flex gap-1.5 flex-wrap">{c.nested.map((n, k) => <span key={k} className="inline-flex items-center gap-1 px-2 py-px rounded-full text-note font-semibold border border-line"><PowerGlyph on={n.on} size="size-3.5" />{n.name}</span>)}</p>
    </>}
    <H4>Checks {e || w ? <SevBadges e={e} w={w} /> : <Count>0</Count>}</H4>
    <ChecksList issues={c.issues} ctx={ctx} />
    <H4>Machines <Count>{rows.length}</Count></H4>
    {c.nested.length > 0 && <p className="sub m-0">This circuit only. Nested switches have their own card.</p>}
    <MachineTable rows={rows} withCircuit={false} />
    {c.depotIn.length > 0 && <>
      <H4><GameIcon k={MERCER} className="size-[18px]" />Dimensional depot uploads</H4>
      <ul className="list-none m-0 p-0 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-1">
        {c.depotIn.map(d => <li key={d.item} className="flex items-center gap-1.5 border-b border-dotted border-line py-[3px]"><GameIcon k={d.item} /><span className="flex-1 min-w-0">{d.name}</span><b className="font-mono font-medium text-sm">{d.rate === null ? '?' : `${num(d.rate)}/min`}</b><span className="sub">{plural(d.uploaders, 'uploader')}</span></li>)}
      </ul>
    </>}
    <NetTable list={c.belts} kind="Belt" ctx={ctx} /><NetTable list={c.pipes} kind="Pipe" ctx={ctx} />
  </>;
}

function BlueprintDrawer({ b }: { b: BlueprintReport }) {
  const m = useApp(powerMult); const [e, w] = tally(b.issues); const { ins, outs } = bpNet(b);
  const inside = b.io.filter(x => Math.abs(x.out - x.inp) <= 0.01);
  const machines = b.rows.reduce((a, r) => a + r.n, 0);
  const used = b.ports.filter(p => Object.keys(p.flow).length);
  const ctx: IssueContext = { graphs: b.graphs, checks: b.checks, plain: true, label: b.name };
  const ioRows = (l: typeof b.io, tone: string) => l.map(x => (
    <tr key={x.item}><td><GameIcon k={x.item} /> {x.name}</td><td className="numc">{x.inp ? num(x.inp) : ''}</td><td className="numc">{x.out ? num(x.out) : ''}</td>
      <td className={`numc font-medium ${tone}`}>{x.out - x.inp > 0 ? '+' : x.out - x.inp < 0 ? '−' : ''}{num(Math.abs(x.out - x.inp))}</td></tr>));
  const section = (t: string) => <tr><th colSpan={4} className="bg-panel-2 font-head font-semibold text-2xs uppercase tracking-[.06em] text-muted">{t}</th></tr>;
  /** Rate of one item for a machine row: negative = used. */
  const rate = (k: string, v: number) => (
    <Tip key={k} tip={`${v < 0 ? 'uses' : 'makes'} ${num(Math.abs(v))}/min`} className="inline-flex gap-[3px] items-center whitespace-nowrap">
      <GameIcon k={k} /><b className={`font-mono font-medium text-note ${v < 0 ? 'text-neg' : 'text-pos'}`}>{v < 0 ? '−' : '+'}{num(Math.abs(v))}</b>
    </Tip>);
  return <>
    <Head eyebrow={<>Blueprint{b.folder ? ` · ${b.folder}` : ''}</>} title={b.name}>{b.desc && <p className="m-0 sub">{b.desc}</p>}</Head>
    {b.error && <p className="m-0 px-3.5 py-2.5 border border-err rounded text-err bg-panel">This blueprint could not be read: {b.error}</p>}
    <Kpis>
      <div><span className="label">Power at 100%</span><KpiValue>{mw(b.power.draw * m)}</KpiValue><span className="sub">{num(b.power.draw)} MW base × {num(m)} power cost</span></div>
      <div><span className="label">Generates</span><KpiValue className={b.power.gen ? 'text-pos' : ''}>{b.power.gen ? `+${mw(b.power.gen)}` : '–'}</KpiValue><span className="sub">{b.power.gen ? `net ${signed(b.power.gen - b.power.draw * m)}` : 'no generator'}</span></div>
      <div><span className="label">Machines</span><KpiValue>{machines}</KpiValue><span className="sub">{b.power.nets <= 1 ? (b.power.machines ? 'one power network' : 'no powered machine') : `${b.power.nets} power networks`}{b.power.unwired ? `, ${b.power.unwired} unwired` : ''}</span></div>
      <div><span className="label">Open ports</span><KpiValue>{used.length}<span className="sub"> / {b.ports.length}</span></KpiValue><span className="sub">used for inputs / outputs</span></div>
    </Kpis>
    <H4>Checks {e || w ? <SevBadges e={e} w={w} /> : <Count>0</Count>}</H4>
    <ChecksList issues={b.issues} ctx={ctx} />
    <H4>Inputs and outputs <Count>per minute, every machine at its clock</Count></H4>
    {b.io.length ? (
      <div className="tbl"><table>
        <thead><tr><th>Item</th><th className="numc">Used</th><th className="numc">Made</th><th className="numc">Net</th></tr></thead>
        <tbody>
          {ins.length > 0 && <>{section('Needs from outside')}{ioRows(ins, 'text-neg')}</>}
          {outs.length > 0 && <>{section('Gives out')}{ioRows(outs, 'text-pos')}</>}
          {inside.length > 0 && <>{section('Made and used inside')}{ioRows(inside, 'text-muted')}</>}
        </tbody>
      </table></div>
    ) : <p className="m-0 p-2 text-faint text-sm">No production machine.</p>}
    {used.length > 0 && <>
      <H4>Where items enter and leave <Count>{plural(used.length, 'open port')}</Count></H4>
      <div className="tbl"><table>
        <thead><tr><th>Port</th><th>On</th><th>Carries /min</th><th className="numc">At (m)</th></tr></thead>
        <tbody>{used.map((p, k) => (
          <tr key={k}><td>{p.kind === 'in' ? 'Input' : p.kind === 'out' ? 'Output' : 'Pipe end'}</td><td>{p.on}</td>
            <td className="space-x-1">{Object.entries(p.flow).map(([i, v]) => <span key={i} className="inline-flex gap-[3px] items-center whitespace-nowrap"><GameIcon k={i} /><b className={`font-mono font-medium text-note ${v < 0 ? 'text-pos' : 'text-neg'}`}>{v < 0 ? 'out ' : 'in '}{num(Math.abs(v))}</b></span>)}</td>
            <td className="numc">{coords(p.at)}</td></tr>))}
        </tbody>
      </table></div>
      <p className="sub m-0">Rates the belt solver routes through each open belt end, splitter or merger input, merger output or pipe end to keep every machine at 100%.</p>
    </>}
    <H4>Machines <Count>{machines}</Count></H4>
    {b.rows.length ? (
      <div className="tbl"><table>
        <thead><tr><th>Machine · recipe</th><th className="numc">#</th><th className="numc">Clock</th><th className="numc">MW at 100%</th><th>Per minute</th></tr></thead>
        <tbody>{b.rows.map((r, k) => (
          <tr key={k}><td><span className="font-medium">{r.b}</span>{r.r && <span className="block text-muted text-xs">{r.r}</span>}</td><td className="numc">{r.n}</td><td className="numc">{num(r.clk * 100)}%</td>
            <td className="numc">{r.gen ? <span className="text-pos">+{num(r.gen)}</span> : num(r.mw * m)}</td>
            <td><span className="flex flex-wrap gap-x-2.5 gap-y-0.5">{Object.entries(r.io).sort((a, c) => a[1] - c[1]).map(([i, v]) => rate(i, v))}</span></td></tr>))}
        </tbody>
      </table></div>
    ) : <p className="m-0 p-2 text-faint text-sm">No machine.</p>}
    <NetTable list={b.belts} kind="Belt" ctx={ctx} /><NetTable list={b.pipes} kind="Pipe" ctx={ctx} />
  </>;
}

export function Drawer() {
  const open = useApp(s => s.open); const report = useApp(s => s.report); const blueprints = useApp(s => s.blueprints);
  const bp = open?.startsWith('bp:') ? blueprints[+open.slice(3)] : undefined;
  const card = !bp && open ? report?.cards.find(c => c.key === open) : undefined;
  if (!bp && !card) return null;
  return <>
    <div className="fixed inset-0 bg-black/40 z-20" onClick={close} />
    <aside className="fixed z-30 inset-y-0 right-0 w-[min(760px,100vw)] overflow-y-auto bg-panel border-l border-line shadow-panel flex flex-col gap-3 [&>*]:shrink-0
      pt-[calc(18px+env(safe-area-inset-top))] pr-[max(20px,env(safe-area-inset-right))] pb-[calc(28px+env(safe-area-inset-bottom))] pl-5">
      {bp ? <PlainCoords.Provider value><BlueprintDrawer key={open} b={bp} /></PlainCoords.Provider> : <CardDrawer key={open} c={card!} report={report!} />}
    </aside>
  </>;
}
