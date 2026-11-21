// Small shared pieces: severity badges, coordinates, power bars and tables, circuit chips.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Card, DepotFlow, PowerSum } from '../../report/types';
import { coords, deltaClass, mw, num, plural, signed } from '../lib/format';
import { mapUrl, scimPos } from '../lib/params';
import { useApp } from '../store';
import { Tip } from './Tooltip';
import { AUGMENTER, BoltIcon, CopyIcon, ErrorIcon, GameIcon, MERCER, SLOOP, WarnIcon } from './icons';

/** Error / warning counts as tinted chips. */
export function SevBadges({ e, w, hint = '' }: { e: number; w: number; hint?: string }) {
  if (!e && !w) return null;
  const tip = `${e ? plural(e, 'error') : ''}${e && w ? ', ' : ''}${w ? plural(w, 'warning') : ''}${hint ? `. ${hint}` : ''}`;
  const chip = 'inline-flex items-center gap-1 pl-1 pr-[7px] py-0.5 rounded-md font-mono font-semibold text-xs/[1.25] tabular-nums';
  return (
    <Tip tip={tip} className="inline-flex gap-1 flex-none">
      {e > 0 && <span className={`${chip} bg-err-bg text-err-fg`}><ErrorIcon className="size-3.5" /><b>{e}</b><span className="sr-only"> errors</span></span>}
      {w > 0 && <span className={`${chip} bg-warn-bg text-warn-fg`}><WarnIcon className="size-3.5" /><b>{w}</b><span className="sr-only"> warnings</span></span>}
    </Tip>
  );
}

// ---------------------------------------------------------------- coordinates
/** Blueprint coordinates are local to the blueprint: shown as plain text, not as a map link. */
export const PlainCoords = createContext(false);

/** Coordinates (m): link to the spot on the SCIM interactive map + copy button. */
export function Coords({ at }: { at: number[] }) {
  const plain = useContext(PlainCoords);
  const [copied, setCopied] = useState(false);
  const chip = 'border border-line bg-panel-2 px-1.5 py-px font-mono text-xs/normal text-muted whitespace-nowrap';
  if (plain) return <Tip tip="Metres from the blueprint centre" className={`${chip} rounded-[3px]`}>{coords(at)}</Tip>;
  const pos = scimPos(at);
  const copy = () => navigator.clipboard?.writeText(pos).then(() => { setCopied(true); setTimeout(() => setCopied(false), 900); }).catch(() => {});
  return (
    <span className="inline-flex items-stretch whitespace-nowrap">
      <Tip tip="Open on the Satisfactory Calculator map">
        <a className={`${chip} rounded-l-[3px] no-underline hover:underline hover:text-fg`} href={mapUrl(at)} target="_blank" rel="noopener">{coords(at)}</a>
      </Tip>
      <Tip tip={`Copy the Satisfactory Calculator map position: ${pos}`} className="inline-flex">
        <button type="button" onClick={copy} aria-label="Copy map position"
          className={`border border-l-0 border-line bg-panel-2 rounded-r-[3px] px-1 cursor-copy inline-flex items-center hover:text-fg ${copied ? 'text-pos' : 'text-muted'}`}>
          <CopyIcon />
        </button>
      </Tip>
    </span>
  );
}

// ---------------------------------------------------------------- power
export const BLOCKS = 8;
export function niceStep(v: number) { const e = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= v) return m * e; return 10 * e; }
/** MW per block so that the biggest circuit fills the 8 blocks. */
export function useBlockMW() {
  const cards = useApp(s => s.report?.cards);
  return useMemo(() => {
    let m = 1; for (const c of cards || []) m = Math.max(m, Math.abs(c.power.gen - c.power.draw), Math.abs(c.power.maxGen - c.power.maxDraw));
    return niceStep(m / BLOCKS);
  }, [cards]);
}

/** 8-block power bar: coloured = current delta, dark grey = delta at full load, light grey = scale. */
export function PowerBar({ p, step, big = false }: { p: PowerSum; step: number; big?: boolean }) {
  const eff = p.gen - p.draw, pot = p.maxGen - p.maxDraw;
  const fill = (v: number, i: number) => `${(Math.max(0, Math.min(1, Math.abs(v) / step - i)) * 100).toFixed(1)}%`;
  const flip = Math.abs(pot) > 0.5 && Math.abs(eff) > 0.5 && Math.sign(pot) !== Math.sign(eff);
  return (
    <span aria-hidden="true" className={`inline-grid flex-none ${big ? 'grid-cols-[repeat(8,16px)] h-3.5 gap-[3px]' : 'grid-cols-[repeat(8,9px)] h-2.5 gap-0.5'}`}>
      {Array.from({ length: BLOCKS }, (_, i) => (
        <i key={i} className="relative bg-bar-bg rounded-[1.5px] overflow-hidden">
          <b className="absolute inset-y-0 left-0" style={{ width: fill(pot, i), background: flip ? 'repeating-linear-gradient(135deg, var(--bar-max) 0 2px, transparent 2px 4px)' : 'var(--bar-max)' }} />
          <b className={`absolute inset-y-0 left-0 ${eff >= 0 ? 'bg-pos' : 'bg-neg'}`} style={{ width: fill(eff, i) }} />
        </i>
      ))}
    </span>
  );
}
export function Delta({ v, className = '' }: { v: PowerSum; className?: string }) {
  return <span className={`num font-medium ${deltaClass(v)} ${className}`}>{signed(v.gen - v.draw)}</span>;
}
export function PowerTable({ p }: { p: PowerSum }) {
  const rows = [
    ['Generated', mw(p.gen), `max ${mw(p.maxGen)}`, `${plural(p.gens, 'generator')}${p.idleGens ? `, ${p.idleGens} idle` : ''}`],
    ['Drawn', mw(p.draw), `max ${mw(p.maxDraw)}`, plural(p.consumers, 'consumer')],
    ['Delta', signed(p.gen - p.draw), `max ${signed(p.maxGen - p.maxDraw)}`, 'at full load'],
  ];
  return <>
    <table className="tipt tabular-nums"><tbody>{rows.map(r => <tr key={r[0]}><th>{r[0]}</th><td>{r[1]}</td><td>{r[2]}</td><td className="sub font-body!">{r[3]}</td></tr>)}</tbody></table>
    {p.boost ? <p className="sub">Generation includes the {boostPct(p.boost)} boost of the Alien Power Augmenters on this circuit.</p> : null}
  </>;
}
export const boostPct = (b: number) => `+${Math.round(b * 100)}%`;
export function PowerTip({ c }: { c: Card }) {
  const p = c.power, o = c.ownPower;
  return <>
    <PowerTable p={p} />
    {c.kind === 'main' && <p className="sub">Only machines wired straight to the main grid. Everything behind a priority switch is left out.</p>}
    {c.nested.length > 0 && c.kind !== 'main' && (o.gen !== p.gen || o.draw !== p.draw) && <p className="sub">Includes nested switches that are on. This switch's own circuit: {signed(o.gen - o.draw)}.</p>}
    {c.kind === 'switch' && !c.on && <p className="sub">Switch is off: this is what turning it on would add to the grid.</p>}
  </>;
}

// ---------------------------------------------------------------- chips
export function Quadrant({ c }: { c: Pick<Card, 'quadrant' | 'quadrantFromTag'> }) {
  if (!c.quadrant) return null;
  const cls = `px-[5px] py-px border border-line rounded-[3px] text-muted font-mono font-medium text-[11.5px]/[1.3] ${c.quadrantFromTag ? '' : 'border-dashed'}`;
  return c.quadrantFromTag ? <span className={cls}>{c.quadrant}</span>
    : <Tip tip="Quadrant estimated from the position of the machines (no XnYn in the name)" className={cls}>{c.quadrant}</Tip>;
}
const rate = (r: number | null) => r === null ? '?' : num(r);
export function DepotTable({ list }: { list: DepotFlow[] }) {
  return <>
    <table className="tipt"><tbody>{list.map(d => <tr key={d.item}><td><GameIcon k={d.item} className="size-[18px]" /></td><th>{d.name}</th><td>{d.rate === null ? '?' : `${num(d.rate)}/min`}</td><td className="sub font-body!">{plural(d.uploaders, 'uploader')}</td></tr>)}</tbody></table>
    <p className="sub">Items per minute the production line can push into the dimensional depot uploaders of this circuit while they pull (the depot fills before the overflow consumers). ? = fed from a train or truck station, rate unknown.</p>
  </>;
}
export function DepotChip({ list }: { list: DepotFlow[] }) {
  if (!list.length) return null;
  return (
    <Tip tip={<DepotTable list={list} />} className="inline-flex items-center flex-wrap gap-x-2 gap-y-0.5 max-w-full justify-self-start pl-1 pr-2 py-[3px] rounded-md bg-depot-bg text-depot-fg font-mono font-medium text-xs/[1.2] tabular-nums">
      <GameIcon k={MERCER} className="size-[18px] mr-0.5" alt="Dimensional depot" />
      {list.map(d => <span key={d.item} className="inline-flex items-center gap-[3px]"><GameIcon k={d.item} className="size-[15px]" alt={d.name} /><b>{rate(d.rate)}</b></span>)}
    </Tip>
  );
}
export function SloopChip({ c }: { c: Card }) {
  if (!c.sloops) return null;
  return <Tip tip={`${plural(c.sloops, 'Somersloop')}: ${Object.entries(c.sloopBy).map(([k, v]) => `${v} in ${k}`).join(' · ')}`} className="inline-flex items-center gap-[3px] text-sloop font-mono"><GameIcon k={SLOOP} alt="Somersloops" />{c.sloops}</Tip>;
}
export function AugmenterChip({ c }: { c: Card }) {
  if (!c.augmenters) return null;
  return <Tip tip={`${plural(c.augmenters, 'Alien Power Augmenter')} (${c.augmenters * 10} Somersloops)`} className="inline-flex items-center gap-[3px] text-fg font-mono"><GameIcon k={AUGMENTER} alt="Power augmenters" />{c.augmenters}</Tip>;
}
export function DeficitFlag({ soft = false, children, tip }: { soft?: boolean; children: ReactNode; tip?: string }) {
  const cls = `inline-flex items-center gap-[3px] pl-[3px] pr-1.5 rounded-[3px] font-head font-semibold text-[11.5px]/[1.5] tracking-[.03em] whitespace-nowrap ${soft ? 'text-warn shadow-[inset_0_0_0_1px_var(--warn)]' : 'bg-err text-white'}`;
  return tip ? <Tip tip={tip} className={cls}><BoltIcon className="size-[13px]" />{children}</Tip> : <span className={cls}><BoltIcon className="size-[13px]" />{children}</span>;
}
export function DeficitChip({ c }: { c: Card }) {
  if (!c.genDeficit) return null;
  const p = c.power, d = p.gen - p.draw, now = d < -0.5;
  const msg = now ? `Negative (${signed(d)}) although it has ${plural(p.gens, 'generator')}: it cannot run on its own, and on the main grid it pulls ${mw(-d)} from it.`
    : `Goes negative at full load (${signed(p.maxGen - p.maxDraw)}) although it has ${plural(p.gens, 'generator')}.`;
  return <DeficitFlag soft={!now} tip={msg}>{p.gens} gen{p.gens === 1 ? '' : 's'} short</DeficitFlag>;
}
/** Item rate chip (blueprints): icon + amount, red = input, green = output. */
export function IoChip({ item, name, v, dir, prefix = '' }: { item: string; name: string; v: number; dir: 'in' | 'out'; prefix?: string }) {
  const icons = useApp(s => s.icons);
  return (
    <Tip tip={`${name}: ${num(Math.abs(v))}/min`} className="inline-flex gap-[3px] items-center whitespace-nowrap">
      {icons.has(item) ? <GameIcon k={item} alt={name} /> : <span className="text-2xs text-muted">{name}</span>}
      <b className={`font-mono font-medium text-note ${dir === 'in' ? 'text-neg' : 'text-pos'}`}>{prefix}{num(Math.abs(v))}</b>
    </Tip>
  );
}

export const Faint = ({ children = '–' }: { children?: ReactNode }) => <span className="text-faint">{children}</span>;
export function CloseButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label="Close" className="flex-none size-[34px] border border-line bg-panel-2 rounded text-[22px] leading-none cursor-pointer hover:bg-head">×</button>;
}
export const Eyebrow = ({ children }: { children: ReactNode }) => <p className="m-0 font-head font-semibold text-2xs tracking-widest uppercase text-muted">{children}</p>;
export const Count = ({ children }: { children: ReactNode }) => <span className="font-mono font-medium text-xs text-muted">{children}</span>;
