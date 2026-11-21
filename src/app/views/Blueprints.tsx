// Blueprints: one card per blueprint with its checks, power and what it needs / gives per minute.
import { useEffect, useState } from 'react';
import type { BlueprintReport } from '../../report/types';
import { mw, plural, tally } from '../lib/format';
import { loadFiles } from '../loader';
import { powerMult, setBpMult, setState, useApp } from '../store';
import { BoltIcon, ErrorIcon, OkIcon } from '../components/icons';
import { Tip } from '../components/Tooltip';
import { Count, Faint, IoChip, SevBadges } from '../components/ui';

export const bpNet = (b: BlueprintReport) => ({
  ins: b.io.filter(x => x.out - x.inp < -0.01).sort((a, c) => (a.out - a.inp) - (c.out - c.inp)),
  outs: b.io.filter(x => x.out - x.inp > 0.01).sort((a, c) => (c.out - c.inp) - (a.out - a.inp)),
});

function BlueprintCard({ b, i, mult }: { b: BlueprintReport; i: number; mult: number }) {
  const [e, w] = tally(b.issues); const { ins, outs } = bpNet(b);
  const machines = b.rows.reduce((a, r) => a + r.n, 0);
  const chips = (l: typeof ins, dir: 'in' | 'out') => <>{l.slice(0, 5).map(x => <IoChip key={x.item} item={x.item} name={x.name} v={x.out - x.inp} dir={dir} />)}{l.length > 5 && <Faint>+{l.length - 5}</Faint>}</>;
  return (
    <button type="button" onClick={() => setState({ open: `bp:${i}` })}
      className="text-left grid gap-1.5 content-start px-3 py-2.5 bg-panel border border-transparent rounded cursor-pointer min-w-0 hover:border-line hover:bg-panel-2">
      <span className="flex gap-2 items-start min-w-0">
        <span className="flex-1 min-w-0 font-semibold [overflow-wrap:anywhere]">{b.name}</span>
        {b.error ? <span className="inline-flex items-center gap-1 pl-1 pr-[7px] py-0.5 rounded-md bg-err-bg text-err-fg font-mono font-semibold text-xs"><ErrorIcon className="size-3.5" /><b>!</b></span> : <SevBadges e={e} w={w} />}
        {!b.error && !e && !w && <Tip tip="All checks pass" className="inline-flex ml-auto"><OkIcon /></Tip>}
      </span>
      <span className="text-note text-muted [&_b]:text-fg [&_b]:font-mono [&_b]:font-medium">
        {b.error ? `Could not be read: ${b.error}` : <>
          {plural(machines, 'machine')}{b.power.draw > 0 && <> · <b>{mw(b.power.draw * mult)}</b></>}{b.power.gen > 0 && <> · <b className="text-pos!">+{mw(b.power.gen)}</b></>}{b.dims.length > 0 && ` · ${b.dims[0]}×${b.dims[1]} designer`}
        </>}
      </span>
      {(ins.length > 0 || outs.length > 0) && (
        <span className="flex flex-wrap gap-x-2 gap-y-1 items-center font-mono font-medium text-note">
          {ins.length ? chips(ins, 'in') : <Faint>no input</Faint>}
          <span className="text-faint" aria-hidden="true">→</span>
          {outs.length ? chips(outs, 'out') : b.power.gen ? <Tip tip="Generates power" className="inline-flex gap-[3px] items-center"><BoltIcon /><b className="text-pos">{mw(b.power.gen)}</b></Tip> : <Faint>no output</Faint>}
        </span>
      )}
    </button>
  );
}

export function Blueprints() {
  const blueprints = useApp(s => s.blueprints);
  const mult = useApp(powerMult); const userMult = useApp(s => s.bpMult); const saveMult = useApp(s => s.report?.powerMult);
  const byFolder = new Map<string, [BlueprintReport, number][]>();
  blueprints.forEach((b, i) => { const l = byFolder.get(b.folder) ?? byFolder.set(b.folder, []).get(b.folder)!; l.push([b, i]); });
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => { const f = [...(e.target.files || [])]; e.target.value = ''; loadFiles(f); };
  return (
    <div className="grid gap-3.5">
      <div className="flex gap-x-3 gap-y-2 flex-wrap items-center">
        <label className="btn">Load blueprint folder…<input type="file" hidden {...{ webkitdirectory: '' }} multiple onChange={pick} /></label>
        <label className="btn">Pick files…<input type="file" accept=".sbp,.sbpcfg" multiple hidden onChange={pick} /></label>
        <label className="inline-flex items-center gap-1.5 font-medium">
          <span>Power cost ×</span>
          <MultInput mult={mult} />
          <span className="sub">{userMult == null ? (saveMult ? `from the loaded save (×${saveMult})` : 'default') : 'set by you'}</span>
        </label>
        <p className="m-0 text-muted text-sm flex-[1_1_320px]">A blueprint needs both its <code>.sbp</code> and <code>.sbpcfg</code>. Open belt ends, open splitter / merger inputs, merger outputs and pipe ends are its inputs and outputs. Click a blueprint for its checks.</p>
      </div>
      {!blueprints.length
        ? <p className="m-0 py-8 px-2 text-faint text-base text-center">No blueprint loaded yet. Pick your blueprint folder: <code>%LOCALAPPDATA%\FactoryGame\Saved\SaveGames\blueprints\&lt;session&gt;\</code></p>
        : [...byFolder].map(([f, l]) => (
          <section key={f} className="grid gap-2">
            {(byFolder.size > 1 || f) && <h2 className="m-0 font-head font-semibold text-[17px] flex gap-2 items-baseline">{f || 'Blueprints'} <Count>{l.length}</Count></h2>}
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]">{l.map(([b, i]) => <BlueprintCard key={`${b.folder}/${b.name}`} b={b} i={i} mult={mult} />)}</div>
          </section>
        ))}
    </div>
  );
}

/** Power cost multiplier: empty or invalid = back to the save's (or 1). */
function MultInput({ mult }: { mult: number }) {
  const [text, setText] = useState(String(mult));
  useEffect(() => { if (parseFloat(text) !== mult) setText(String(mult)); }, [mult]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input type="number" min="0.1" step="0.5" inputMode="decimal" value={text} aria-label="Power cost multiplier"
    onChange={e => { setText(e.target.value); const v = parseFloat(e.target.value); setBpMult(v > 0 ? v : null); }}
    onBlur={() => setText(String(mult))}
    className="w-[70px] px-2 py-1.5 border border-line rounded bg-panel font-mono" />;
}
