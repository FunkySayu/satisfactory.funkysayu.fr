// Page header: brand, the whole grid as it runs now, somersloops, and the actions.
import { useEffect, useState } from 'react';
import type { SaveReport } from '../../report/types';
import { mw, num, plural, signed, TONE_TEXT, deltaTone } from '../lib/format';
import { mapUrl } from '../lib/params';
import { PREF, readPref, writePref } from '../lib/storage';
import { loadFiles } from '../loader';
import { useApp, type RemoteStatus } from '../store';
import { AUGMENTER, GameIcon, MapIcon, SLOOP, ThemeIcon } from './icons';
import { Tip } from './Tooltip';
import { BLOCKS, Delta, niceStep, PowerBar, PowerTable } from './ui';

function GridSummary({ r }: { r: SaveReport }) {
  const p = r.live; const eff = p.gen - p.draw, pot = p.maxGen - p.maxDraw;
  const step = niceStep(Math.max(1, Math.abs(eff), Math.abs(pot)) / BLOCKS);
  const s = r.sloops; const total = s.machines + s.augmenterSloops + s.depot;
  const sl = 'inline-flex items-center gap-[5px] [&_b]:font-mono [&_b]:font-medium [&_b]:text-xl/none [&_b]:tabular-nums';
  const block = 'grid gap-0.5 justify-items-end max-[900px]:justify-items-start text-right max-[900px]:text-left min-w-0';
  const depotTip = <>
    <p className="sub mt-0!">{plural(s.depot, 'Somersloop')} uploaded to the dimensional depot, not in use.</p>
    {r.depotStored.length > 0 && <table className="tipt"><tbody>{r.depotStored.slice(0, 12).map(d => <tr key={d.item}><td><GameIcon k={d.item} className="size-[18px]" /></td><th>{d.name}</th><td>{num(d.n)}</td></tr>)}</tbody></table>}
    {r.depotStored.length > 12 && <p className="sub">+{r.depotStored.length - 12} more items in the depot</p>}
  </>;
  return (
    <div className="flex gap-x-7 gap-y-3 justify-end max-[900px]:justify-start flex-wrap items-center max-[900px]:col-span-full max-[900px]:row-start-2">
      <div className={block}>
        <span className="label">Somersloops · {total}</span>
        <span className="flex gap-3.5 items-baseline flex-wrap justify-end max-[900px]:justify-start">
          <Tip tip={`${plural(s.machines, 'Somersloop')} slotted in production machines`} className={sl}><GameIcon k={SLOOP} className="size-[22px] self-center" alt="In machines" /><b>{s.machines}</b><span className="sub">machines</span></Tip>
          <Tip tip={`${plural(s.augmenters, 'Alien Power Augmenter')} built, 10 Somersloops each`} className={sl}><GameIcon k={AUGMENTER} className="size-[22px] self-center" alt="In power augmenters" /><b>{s.augmenterSloops}</b><span className="sub">{plural(s.augmenters, 'augmenter')}</span></Tip>
          <Tip tip={depotTip} className={sl}><GameIcon k={SLOOP} className="size-[22px] self-center grayscale opacity-55" alt="Unused in depot" /><b>{s.depot}</b><span className="sub">depot</span></Tip>
        </span>
      </div>
      <div className={block}>
        <span className="label">Main grid, all switches</span>
        <Tip tip={<><PowerTable p={p} /><p className="sub">Main grid plus every priority switch that is on. One block = {step.toLocaleString('en-US')} MW.</p></>} className="inline-flex items-center gap-2.5">
          <PowerBar p={p} step={step} big /><Delta v={p} className="text-[22px] font-bold" />
        </Tip>
        <span className="sub">{mw(p.gen)} generated · {mw(p.draw)} drawn{Math.sign(pot) !== Math.sign(eff) && Math.abs(pot) > 0.5 && <> · <span className={`num ${TONE_TEXT[deltaTone(pot)]}`}>{signed(pot)} at full load</span></>}</span>
      </div>
    </div>
  );
}

function LiveBadge({ remotes }: { remotes: RemoteStatus[] }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 5000); return () => clearInterval(t); }, []);
  const bad = remotes.some(s => s.fail);
  const line = (s: RemoteStatus) => {
    const ago = s.checked ? Math.round((Date.now() - s.checked) / 1000) : null;
    return `${s.what[0].toUpperCase()}${s.what.slice(1)}: ${s.fail ? `last check failed (${s.fail})` : ago === null ? 'not checked yet' : `checked ${ago <= 1 ? 'just now' : `${ago} s ago`}`}`;
  };
  return (
    <Tip tip={() => `Live reload: checks every second and reloads what changed. ${remotes.map(line).join('. ')}.`}
      className={`inline-flex items-center gap-1.5 px-1.5 text-sm font-semibold cursor-default ${bad ? 'text-warn' : 'text-pos'}`}>
      <span className={`size-2 rounded-full bg-current ${bad ? '' : 'animate-pulse'}`} />Live
    </Tip>
  );
}

type Theme = 'system' | 'light' | 'dark';
function ThemeButton() {
  const [theme, setTheme] = useState<Theme>(() => { const s = readPref(PREF.theme); return s === 'light' || s === 'dark' ? s : 'system'; });
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    writePref(PREF.theme, theme === 'system' ? null : theme);
  }, [theme]);
  const next = () => setTheme(t => t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system');
  return <button type="button" className="btn" onClick={next} aria-label={`Theme: ${theme}`} title={`Theme: ${theme} (click to change)`}><ThemeIcon /><span className="capitalize max-sm:hidden">{theme}</span></button>;
}

export function Header() {
  const report = useApp(s => s.report); const live = useApp(s => s.live); const remotes = useApp(s => s.remotes);
  return (
    <header className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] max-[900px]:grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
      <div className="flex items-baseline gap-3 min-w-0 flex-wrap">
        <span aria-hidden="true" className="font-head font-bold text-[22px]/none tracking-[.06em]">FICS<span className="text-brand italic">IT</span></span>
        <h1 className="m-0 font-head font-medium text-[19px]/[1.2] text-balance">Prioritized Automatic Circuit Break System</h1>
      </div>
      {report ? <GridSummary r={report} /> : <div className="max-[900px]:hidden" />}
      <div className="flex gap-2 items-center">
        {live && <LiveBadge remotes={remotes} />}
        <ThemeButton />
        <a className="btn" href={mapUrl()} target="_blank" rel="noopener" title="Open this save on the Satisfactory Calculator interactive map">
          <MapIcon /><span className="max-sm:hidden">Interactive map</span>
        </a>
        <label className="btn">Load save…<input type="file" accept=".sav" hidden onChange={e => { const f = [...(e.target.files || [])]; e.target.value = ''; loadFiles(f); }} /></label>
      </div>
    </header>
  );
}
