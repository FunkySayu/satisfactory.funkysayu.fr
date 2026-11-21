// Per priority switch: the in-game circuit-break panel. Priority groups 1-4 on top, 5-8 below, then the ungrouped
// circuits (main grid, separate grids) and the switches without a priority.
import type { Card, SaveReport } from '../../report/types';
import { mw, plural, sumPower, tally } from '../lib/format';
import { setState } from '../store';
import { PowerGlyph } from '../components/icons';
import { Tip } from '../components/Tooltip';
import { AugmenterChip, Delta, DeficitChip, DeficitFlag, DepotChip, PowerBar, PowerTable, PowerTip, Quadrant, SevBadges, SloopChip } from '../components/ui';

function SwitchRow({ c, step }: { c: Card; step: number }) {
  const [e, w] = tally(c.issues);
  const off = c.kind === 'switch' && !c.on;
  return (
    <button type="button" onClick={() => setState({ open: c.key })}
      className="group w-full text-left border border-transparent bg-transparent rounded-[3px] px-1.5 pt-1.5 pb-[7px] cursor-pointer grid gap-1 hover:bg-panel-2 hover:border-line">
      <span className="flex items-start gap-[7px] min-w-0">
        {c.kind === 'switch' && <Tip tip={c.on ? 'Switch is on' : 'Switch is off'} className="inline-flex"><PowerGlyph on={!!c.on} knockout="stroke-panel group-hover:stroke-panel-2" /></Tip>}
        <span className={`flex-1 min-w-0 font-medium [overflow-wrap:anywhere] leading-tight ${off ? 'text-muted' : ''}`}>{c.name}</span>
        <span className="ml-auto"><SevBadges e={e} w={w} hint="Click for details." /></span>
      </span>
      <span className="flex items-center gap-x-2.5 gap-y-1.5 flex-wrap font-mono font-medium text-note/[1.2] pl-px">
        <Quadrant c={c} />
        <Tip tip={<PowerTip c={c} />} className="inline-flex items-center gap-[7px]"><PowerBar p={c.power} step={step} /><Delta v={c.power} /></Tip>
        <DeficitChip c={c} /><SloopChip c={c} /><AugmenterChip c={c} />
      </span>
      <DepotChip list={c.depotIn} />
    </button>
  );
}

/** What a whole priority group adds (own circuits of its switches), flagged when it has generators but runs negative. */
function GroupSum({ cards }: { cards: Card[] }) {
  const sw = cards.filter(c => c.kind === 'switch'); if (!sw.length) return null;
  const p = sumPower(sw.map(c => c.ownPower));
  const d = p.gen - p.draw, def = p.gens > 0 && d < -0.5;
  const tip = <>
    <PowerTable p={p} />
    <p className="sub">All {plural(sw.length, 'switch')} of this group together, own circuits only.</p>
    {def && <p className="sub"><b className="text-neg">This group has {plural(p.gens, 'generator')} but runs negative.</b> It cannot be switched on by itself, and connected to the main grid it pulls {mw(-d)} from it.</p>}
  </>;
  return <Tip tip={tip} className="inline-flex items-center gap-1.5 text-sm">{def && <DeficitFlag>short</DeficitFlag>}<Delta v={p} /></Tip>;
}

function Group({ title, cards, place, step }: { title: string; cards: Card[]; place: string; step: number }) {
  return (
    <section className={`bg-panel rounded-[3px] flex flex-col min-w-0 ${place}`}>
      <h2 className="m-0 px-2.5 py-[7px] bg-head font-head font-semibold text-base/[1.2] rounded-t-[3px] flex items-center justify-between gap-2"><span>{title}</span><GroupSum cards={cards} /></h2>
      <div className="p-1.5 grid gap-1 content-start max-board:min-h-[60px]">
        {cards.map(c => <SwitchRow key={c.key} c={c} step={step} />)}
      </div>
    </section>
  );
}

// fixed panel positions on wide screens; stacked, ungrouped first, on narrow ones
const PLACE = [
  'board:col-start-1 board:row-start-1', 'board:col-start-2 board:row-start-1', 'board:col-start-3 board:row-start-1', 'board:col-start-4 board:row-start-1',
  'board:col-start-1 board:row-start-2', 'board:col-start-2 board:row-start-2', 'board:col-start-3 board:row-start-2', 'board:col-start-4 board:row-start-2',
];

export function Board({ report, step }: { report: SaveReport; step: number }) {
  const groups: Card[][] = Array.from({ length: 8 }, () => []); const undef: Card[] = [];
  for (const c of report.cards) if (c.kind === 'switch') (c.priority ? groups[c.priority - 1] : undef).push(c);
  const ungrouped = report.cards.filter(c => c.kind === 'main' || c.kind === 'island');
  return (
    <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 board:grid-cols-5 board:auto-rows-[minmax(200px,auto)]">
      {groups.map((g, i) => <Group key={i} title={`Priority Group ${i + 1}`} cards={g} place={PLACE[i]} step={step} />)}
      <Group title="Ungrouped" cards={ungrouped} place="order-first sm:col-span-full board:order-none board:col-span-1 board:col-start-5 board:row-start-1" step={step} />
      <Group title="Undefined" cards={undef} place="order-last board:order-none board:col-start-5 board:row-start-2" step={step} />
    </div>
  );
}

export function ScaleLegend({ step }: { step: number }) {
  return (
    <p className="m-0 inline-flex items-center gap-1.5 font-mono text-xs text-muted">
      <span aria-hidden="true" className="inline-grid grid-cols-[9px] h-2.5"><i className="relative bg-pos rounded-[1.5px]" /></span> = {step.toLocaleString('en-US')} MW
    </p>
  );
}
