// Powered machines: one row per (machine, recipe), sortable, expandable to every building.
import { Fragment, useState } from 'react';
import type { MachineRow } from '../../report/types';
import { num, plural } from '../lib/format';
import { setState, useApp } from '../store';
import { ChevronIcon, GameIcon, SLOOP } from './icons';
import { Tip } from './Tooltip';
import { Coords, Faint } from './ui';

type Col = 'name' | 'n' | 'gen' | 'draw' | 'clk' | 'sl' | 'dNow' | 'dMax' | 'prod';
interface Agg { key: string; b: string; r: string; n: number; gen: number; draw: number; maxGen: number; maxDraw: number; clk: number; sl: number; prod: number | null; prodN: number; rows: MachineRow[] }
type Sortable = { b: string; r: string; gen: number; draw: number; maxGen: number; maxDraw: number; clk: number; sl: number; prod: number | null; n?: number };

function aggregate(rows: MachineRow[]): Agg[] {
  const m = new Map<string, Agg>();
  for (const x of rows) {
    const k = `${x.b}|${x.r}`;
    const a = m.get(k) ?? m.set(k, { key: k, b: x.b, r: x.r, n: 0, gen: 0, draw: 0, maxGen: 0, maxDraw: 0, clk: 0, sl: 0, prod: null, prodN: 0, rows: [] }).get(k)!;
    a.n++; a.gen += x.gen; a.draw += x.draw; a.maxGen += x.maxGen; a.maxDraw += x.maxDraw; a.clk += x.clk; a.sl += x.sl; a.rows.push(x);
    if (x.prod !== null) { a.prod = (a.prod ?? 0) + x.prod; a.prodN++; }
  }
  for (const a of m.values()) { a.clk /= a.n; if (a.prod !== null) a.prod /= a.prodN; }
  return [...m.values()];
}
const value = (x: Sortable, c: Col): number | string =>
  c === 'name' ? `${x.b} ${x.r}` : c === 'n' ? x.n ?? 1 : c === 'gen' ? x.gen : c === 'draw' ? x.draw : c === 'clk' ? x.clk : c === 'sl' ? x.sl
    : c === 'dNow' ? x.gen - x.draw : c === 'dMax' ? x.maxGen - x.maxDraw : x.prod ?? -1;

const Mw = ({ v }: { v: number }) => Math.abs(v) < 0.05 ? <Faint>0</Faint> : <>{num(v)}</>;
function DeltaCell({ v }: { v: number }) {
  const tone = Math.abs(v) < 0.5 ? 'text-muted' : v > 0 ? 'text-pos' : 'text-neg';
  return <td className={`numc font-medium ${tone}`}>{Math.abs(v) < 0.05 ? '0' : (v > 0 ? '+' : '−') + num(Math.abs(v))}</td>;
}
const ProdCell = ({ v }: { v: number | null }) => <td className={`numc ${v === null ? '' : v < 0.5 ? 'text-err' : v < 0.95 ? 'text-warn' : ''}`}>{v === null ? <Faint /> : `${num(v * 100)}%`}</td>;

export function MachineTable({ rows, withCircuit }: { rows: MachineRow[]; withCircuit: boolean }) {
  const [sort, setSort] = useState<{ col: Col; desc: boolean }>({ col: 'dNow', desc: false });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const cards = useApp(s => s.report?.cards);
  if (!rows.length) return <p className="m-0 p-2 text-faint text-sm">No powered machines.</p>;
  const cardName = (k: string | null) => k === null ? 'Not wired' : cards?.find(c => c.key === k)?.name ?? k;
  const sorter = (a: Sortable, b: Sortable) => {
    const va = value(a, sort.col), vb = value(b, sort.col);
    const r = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return sort.desc ? -r : r;
  };
  const aggs = aggregate(rows).sort(sorter);
  const tot = aggs.reduce((t, a) => ({ n: t.n + a.n, gen: t.gen + a.gen, draw: t.draw + a.draw, maxGen: t.maxGen + a.maxGen, maxDraw: t.maxDraw + a.maxDraw, sl: t.sl + a.sl }), { n: 0, gen: 0, draw: 0, maxGen: 0, maxDraw: 0, sl: 0 });
  const toggle = (k: string) => setOpen(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const th = (c: Col, label: string, tip: string, numeric = true) => (
    <th className={`sticky top-0 z-[1] ${numeric ? 'numc' : ''}`} aria-sort={sort.col === c ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <Tip tip={tip}>
        <button type="button" className="border-0 bg-transparent p-0 [font:inherit] text-inherit [letter-spacing:inherit] uppercase cursor-pointer whitespace-nowrap hover:text-fg"
          onClick={() => setSort(st => st.col === c ? { col: c, desc: !st.desc } : { col: c, desc: c !== 'name' && c !== 'dNow' && c !== 'dMax' })}>
          {label}{sort.col === c ? (sort.desc ? ' ↓' : ' ↑') : ''}
        </button>
      </Tip>
    </th>);
  return (
    <div className="tbl bg-panel">
      <table>
        <thead><tr>
          <th className="w-5 pr-0!" />{th('name', 'Machine · recipe', 'Sort by name', false)}{th('n', '#', 'Number of buildings')}{th('gen', 'Supply', 'Power generated now (MW)')}
          {th('draw', 'Demand', 'Power drawn now (MW)')}{th('clk', 'Clock', 'Average clock speed')}{th('sl', 'Sloops', 'Somersloops slotted')}
          {th('dNow', 'Δ now', 'Supply minus demand now (MW)')}{th('dMax', 'Δ max', 'Supply minus demand at full load (MW)')}{th('prod', 'Prod.', 'Average productivity over the last ~5 min')}
        </tr></thead>
        <tbody>{aggs.map(a => {
          const isOpen = open.has(a.key);
          return (
            <Fragment key={a.key}>
              <tr className="cursor-pointer hover:bg-panel-2" tabIndex={0} aria-expanded={isOpen} onClick={() => toggle(a.key)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(a.key); } }}>
                <td className="w-5 pr-0!"><ChevronIcon className={isOpen ? 'rotate-90' : ''} /></td>
                <td><span className="font-medium">{a.b}</span>{a.r && <span className="block text-muted text-xs">{a.r}</span>}</td>
                <td className="numc">{a.n}</td><td className="numc"><Mw v={a.gen} /></td><td className="numc"><Mw v={a.draw} /></td>
                <td className="numc">{num(a.clk * 100)}%</td>
                <td className="numc">{a.sl ? <span className="inline-flex items-center gap-[3px] text-sloop"><GameIcon k={SLOOP} />{a.sl}</span> : <Faint />}</td>
                <DeltaCell v={a.gen - a.draw} /><DeltaCell v={a.maxGen - a.maxDraw} /><ProdCell v={a.prod} />
              </tr>
              {isOpen && [...a.rows].sort(sorter).map(x => (
                <tr key={x.id} className="[&>td]:bg-panel-2 [&>td]:border-dotted [&>td]:py-1">
                  <td />
                  <td className="space-x-1"><Coords at={x.at} /> <span className="text-faint font-mono text-[11.5px]">#{x.id}</span>
                    {withCircuit && (x.c
                      ? <button type="button" className="link text-muted text-xs underline decoration-dotted" onClick={e => { e.stopPropagation(); setState({ open: x.c }); }}>{cardName(x.c)}</button>
                      : <span className="text-faint">{cardName(x.c)}</span>)}
                  </td>
                  <td /><td className="numc"><Mw v={x.gen} /></td><td className="numc"><Mw v={x.draw} /></td><td className="numc">{num(x.clk * 100)}%</td>
                  <td className="numc">{x.sl || <Faint />}</td><DeltaCell v={x.gen - x.draw} /><DeltaCell v={x.maxGen - x.maxDraw} /><ProdCell v={x.prod} />
                </tr>))}
            </Fragment>);
        })}</tbody>
        <tfoot><tr className="[&>*]:border-t-2 [&>*]:font-semibold">
          <td /><th>Total · {plural(aggs.length, 'kind')}</th><td className="numc">{tot.n}</td><td className="numc">{num(tot.gen)}</td><td className="numc">{num(tot.draw)}</td>
          <td /><td className="numc">{tot.sl || ''}</td><DeltaCell v={tot.gen - tot.draw} /><DeltaCell v={tot.maxGen - tot.maxDraw} /><td />
        </tr></tfoot>
      </table>
    </div>
  );
}
