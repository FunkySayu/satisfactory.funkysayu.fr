// Belt / pipe network diagram as SVG with pan (drag) and zoom (wheel, buttons), plus the tooltips and the detail
// panel of a selected node.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { GEdge, NetGraph, View } from '../../report/types';
import { num, plural, tol } from '../lib/format';
import { useTooltip } from '../components/Tooltip';
import { GameIcon, iconUrl, useHasIcon } from '../components/icons';
import { Coords } from '../components/ui';
import { BOX, layout, nodeFlows, ROUND } from './layout';

const short = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;
type Tone = 'n' | 'err' | 'warn' | 'hl' | 'faint';
const EDGE_STROKE: Record<Tone, string> = { n: 'stroke-edge', err: 'stroke-err', warn: 'stroke-warn', hl: 'stroke-hl', faint: 'stroke-faint' };
const ARROW_FILL: Record<Tone, string> = { n: 'fill-edge', err: 'fill-err', warn: 'fill-warn', hl: 'fill-hl', faint: 'fill-faint' };
const LABEL_RECT: Record<Tone, string> = { n: 'stroke-line', err: 'stroke-err', warn: 'stroke-warn', hl: 'stroke-hl', faint: 'stroke-line' };
const LABEL_TEXT: Record<Tone, string> = { n: 'fill-fg', err: 'fill-err', warn: 'fill-warn', hl: 'fill-fg', faint: 'fill-faint' };

// ---------------------------------------------------------------- tooltips / details
function ItemRows({ g, f }: { g: NetGraph; f: Record<string, number> }) {
  return <>{Object.entries(f).map(([k, v]) => <tr key={k}><td><GameIcon k={k} className="size-[18px]" /></td><th>{g.items[k] ?? k}</th><td>{num(v)}/min</td></tr>)}</>;
}
export function NodeTip({ g, i, flows }: { g: NetGraph; i: number; flows: ReturnType<typeof nodeFlows> }) {
  const n = g.nodes[i]; const { inF, outF } = flows;
  const rows = (n.io || []).map(io => (
    <tr key={io.i}><td><GameIcon k={io.i} className="size-[18px]" /></td><th>{g.items[io.i] ?? io.i}</th>
      {io.s ? <><td>makes {num(io.s)}</td><td className="sub font-body!">sends {num(outF[i][io.i] || 0)}</td></> : null}
      {io.d ? <><td>needs {num(io.d)}</td><td className="sub font-body!">gets {num(inF[i][io.i] || 0)}</td></> : null}</tr>));
  const pass = !n.io?.length && Object.keys(inF[i]).length > 0;
  return <>
    <b>{n.n}</b>{n.r && <div className="sub">{n.r}</div>}
    {(rows.length > 0 || pass) && <table className="tipt"><tbody>{rows.length ? rows : <ItemRows g={g} f={inF[i]} />}</tbody></table>}
    <p className="sub">#{n.id}{n.clk != null && ` · ${num(n.clk * 100)}%`}{n.z != null && ` · z ${num(n.z)} m`} · click for details</p>
  </>;
}
export function EdgeTip({ g, e }: { g: NetGraph; e: GEdge }) {
  const fl = Object.entries(e.f);
  return <>
    <b>{e.parts ? `${plural(e.parts, g.kind === 'belt' ? 'belt' : 'pipe')}${e.tier ? ` · ${e.tier}` : ''}` : 'Direct connection'}</b>
    {e.cap != null && <div className="sub">capacity {num(e.cap)}/min</div>}
    {fl.length ? <table className="tipt"><tbody><ItemRows g={g} f={e.f} /></tbody></table> : <p className="sub">No flow found through it.</p>}
    {e.z != null && <p className="sub">highest point {num(e.z)} m</p>}
    {e.bad === 'cut' && <p className="sub"><b className="text-neg">Bottleneck</b>: part of the narrowest cut.</p>}
    {e.bad === 'over' && <p className="sub"><b className="text-warn">May be overloaded.</b></p>}
    <p className="sub">{g.nodes[e.a].n} → {g.nodes[e.b].n}</p>
  </>;
}
/** What a node gets and where it sends it. */
export function NodeDetail({ g, i, onSelect }: { g: NetGraph; i: number; onSelect: (i: number) => void }) {
  const n = g.nodes[i]; const { inF, outF } = useMemo(() => nodeFlows(g), [g]);
  const ins = g.edges.filter(e => e.b === i), outs = g.edges.filter(e => e.a === i);
  const fl = (f: Record<string, number>) => Object.keys(f).length ? Object.entries(f).map(([k, v]) => <span key={k} className="inline-flex items-center"><GameIcon k={k} className="size-3.5" />{num(v)} </span>) : <span className="text-faint">0</span>;
  const link = (e: GEdge, other: number, k: number) => (
    <li key={k} className="flex gap-1.5 items-center flex-wrap">
      <button type="button" className="link underline decoration-dotted" onClick={() => onSelect(other)}>{g.nodes[other].n}</button>
      <span className="text-faint">{e.parts ? `${plural(e.parts, g.kind === 'belt' ? 'belt' : 'pipe')}${e.tier ? ` ${e.tier}` : ''}` : 'direct'}{e.cap != null && ` · cap ${num(e.cap)}`}</span>
      <span className="font-mono text-[11.5px]">{fl(e.f)}</span>
    </li>);
  return <>
    <div className="flex gap-x-2.5 gap-y-1.5 items-center flex-wrap">
      <b>{n.n}</b>{n.r && <span className="sub">{n.r}</span>} <Coords at={n.at} /> <span className="text-faint font-mono text-[11.5px]">#{n.id}</span>
      {n.clk != null && <span className="sub">clock {num(n.clk * 100)}%</span>}{n.z != null && <span className="sub">z {num(n.z)} m</span>}
    </div>
    {n.io?.length ? (
      <div className="tbl"><table><thead><tr><th>Item /min</th><th className="numc">Makes</th><th className="numc">Sends</th><th className="numc">Needs</th><th className="numc">Gets</th></tr></thead>
        <tbody>{n.io.map(x => (
          <tr key={x.i}><td><GameIcon k={x.i} /> {g.items[x.i] ?? x.i}</td><td className="numc">{x.s ? num(x.s) : ''}</td><td className="numc">{x.s ? num(outF[i][x.i] || 0) : ''}</td>
            <td className="numc">{x.d ? num(x.d) : ''}</td><td className={`numc ${x.d && (inF[i][x.i] || 0) < x.d - 0.05 ? 'text-err' : ''}`}>{x.d ? num(inF[i][x.i] || 0) : ''}</td></tr>))}</tbody></table></div>
    ) : null}
    <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-x-4 gap-y-2">
      {ins.length > 0 && <div><span className="label">From</span><ul className="mt-0.5 grid gap-0.5">{ins.map((e, k) => link(e, e.a, k))}</ul></div>}
      {outs.length > 0 && <div><span className="label">To</span><ul className="mt-0.5 grid gap-0.5">{outs.map((e, k) => link(e, e.b, k))}</ul></div>}
    </div>
  </>;
}

// ---------------------------------------------------------------- diagram
export function NetworkDiagram({ g, focus, selected, onSelect }: { g: NetGraph; focus?: View; selected?: number; onSelect: (i: number) => void }) {
  const L = useMemo(() => layout(g), [g]);
  const flows = useMemo(() => nodeFlows(g), [g]);
  const tip = useTooltip(); const hasIcon = useHasIcon();
  const box = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), dragged = useRef(false);
  const ctl = useRef<{ zoom(f: number): void; fit(): void }>(null);
  const { laid, pts, back, W, H } = L;
  const fn = new Set(focus?.n || []), fe = new Set(focus?.e || []);
  const fb = [...fn].map(i => laid[i]).concat([...fe].flatMap(i => [laid[g.edges[i].a], laid[g.edges[i].b]]));
  const focusBox = fb.length ? [Math.min(...fb.map(b => b.x - b.w / 2)), Math.min(...fb.map(b => b.y - b.h / 2)), Math.max(...fb.map(b => b.x + b.w / 2)), Math.max(...fb.map(b => b.y + b.h / 2))] : null;
  const focusKey = focusBox?.join(',') ?? '';

  // pan / zoom: the view (top-left x, y in diagram units, k px per unit) is applied to the viewBox directly
  useEffect(() => {
    const el = box.current!, s = svg.current!;
    const rect = () => el.getBoundingClientRect();
    let k = 1, x = 0, y = 0;
    const apply = () => { const r = rect(); s.setAttribute('viewBox', `${x} ${y} ${r.width / k} ${r.height / k}`); };
    const fit = () => { const r = rect(); k = Math.min(1.1, r.width / W, r.height / H); x = (W - r.width / k) / 2; y = (H - r.height / k) / 2; apply(); };
    const center = (cx: number, cy: number, kk: number) => { const r = rect(); k = kk; x = cx - r.width / k / 2; y = cy - r.height / k / 2; apply(); };
    // start readable: the whole diagram when it fits at 60%+, else the highlighted part, else its start (the producers)
    const r0 = rect(); const kFit = Math.min(1.1, r0.width / W, r0.height / H), READ = 0.6, K = 0.85;
    const f = focusKey ? focusKey.split(',').map(Number) : null;
    if (kFit >= READ) fit();
    else if (f) {
      const kf = Math.min(1, r0.width / (f[2] - f[0] + 200), r0.height / (f[3] - f[1] + 140));
      if (kf >= READ) center((f[0] + f[2]) / 2, (f[1] + f[3]) / 2, kf);
      else center(f[0] - 60 + r0.width / K / 2, Math.min((f[1] + f[3]) / 2, f[1] - 70 + r0.height / K / 2), K);
    } else { k = K; x = 0; y = Math.max(0, H / 2 - r0.height / k / 2); apply(); }
    const zoom = (fz: number, px?: number, py?: number) => {
      const r = rect(); const mx = px ?? r.width / 2, my = py ?? r.height / 2;
      const ux = x + mx / k, uy = y + my / k; k = Math.max(0.08, Math.min(3, k * fz)); x = ux - mx / k; y = uy - my / k; apply();
    };
    ctl.current = { zoom, fit };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = rect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); };
    let drag: { px: number; py: number; x: number; y: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => { if ((e.target as Element).closest('[data-ctl]')) return; drag = { px: e.clientX, py: e.clientY, x, y, moved: false }; };
    const move = (e: PointerEvent) => {
      if (!drag) return; const dx = e.clientX - drag.px, dy = e.clientY - drag.py;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) { drag.moved = true; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; tip.suppress(true); }
      x = drag.x - dx / k; y = drag.y - dy / k; apply();
    };
    const up = (e: PointerEvent) => {
      if (drag?.moved) { el.style.cursor = ''; el.releasePointerCapture?.(e.pointerId); tip.suppress(false); dragged.current = true; setTimeout(() => { dragged.current = false; }, 0); }
      drag = null;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    const ro = new ResizeObserver(apply); ro.observe(el);
    return () => {
      el.removeEventListener('wheel', wheel); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); ro.disconnect();
    };
  }, [W, H, focusKey, tip]);

  const maxF = Math.max(1, ...g.edges.map(e => Object.values(e.f).reduce((a, b) => a + Math.abs(b), 0)));
  const showTip = (content: ReactNode) => (ev: React.PointerEvent) => tip.show(content, ev.currentTarget);
  const hideTip = () => tip.hide();
  const edges: ReactNode[] = [], labels: ReactNode[] = [], nodes: ReactNode[] = [];
  g.edges.forEach((e, i) => {
    const p = pts[i]; if (!p) return; const A = laid[e.a], B = laid[e.b];
    const tot = Object.values(e.f).reduce((a, b) => a + b, 0);
    // highlighted edges keep their colour (red bottleneck, orange overload) and get a halo
    const tone: Tone = e.bad === 'cut' ? 'err' : e.bad === 'over' ? 'warn' : fe.has(i) ? 'hl' : tot < 1e-6 ? 'faint' : 'n';
    const w = 1.4 + 3.6 * Math.min(1, Math.abs(tot) / maxF) + (fe.has(i) ? 1 : 0);
    const sx = A.x + A.w / 2, ex = B.x - B.w / 2 - 2;
    let d: string;
    if (back.has(i) || e.a === e.b) { const by = H - 24; d = `M${sx},${A.y} C${sx + 70},${by} ${ex - 70},${by} ${ex},${B.y}`; }
    else {
      const q = p.map(([px, py]) => [px, py]); q[0] = [sx, A.y]; q[q.length - 1] = [ex, B.y];
      d = `M${q[0][0]},${q[0][1]}`;
      for (let k = 1; k < q.length; k++) { const [x0, y0] = q[k - 1], [x1, y1] = q[k]; const dx = (x1 - x0) / 2; d += ` C${x0 + dx},${y0} ${x1 - dx},${y1} ${x1},${y1}`; }
    }
    const t = <EdgeTip g={g} e={e} />;
    if (fe.has(i)) edges.push(<path key={`h${i}`} d={d} strokeWidth={(w + 9).toFixed(1)} className="fill-none stroke-hl opacity-30" strokeLinecap="round" />);
    edges.push(<path key={i} d={d} strokeWidth={w.toFixed(1)} markerEnd={`url(#ar-${tone})`} strokeLinecap="round"
      className={`fill-none ${EDGE_STROKE[tone]}`} strokeDasharray={tone === 'faint' ? '5 4' : undefined} onPointerEnter={showTip(t)} onPointerLeave={hideTip} />);
    // label on the first stretch
    const [x0, y0] = p.length > 1 ? [(sx + (p.length > 2 ? p[1][0] : ex)) / 2, (A.y + (p.length > 2 ? p[1][1] : B.y)) / 2] : [sx, A.y];
    const fl = tot ? num(tot) : '0';
    const txt = e.cap != null ? `${fl}/${num(e.cap)}` : (tot ? fl : '');
    const tier = e.tier && g.kind === 'belt' ? e.tier : '';
    if (txt || tier) {
      const tw = `${txt}${tier ? ` ${tier}` : ''}`.length * 6.4 + 10;
      labels.push(
        <g key={i} transform={`translate(${(x0 - tw / 2).toFixed(1)},${(y0 - 9).toFixed(1)})`} onPointerEnter={showTip(t)} onPointerLeave={hideTip}>
          <rect width={tw.toFixed(1)} height="18" rx="9" className={`fill-panel ${LABEL_RECT[tone]}`} />
          <text x={(tw / 2).toFixed(1)} y="12.5" textAnchor="middle" className={`font-mono font-medium text-2xs ${LABEL_TEXT[tone]}`}>{txt}{tier && <tspan className="fill-muted"> {tier}</tspan>}</text>
        </g>);
    }
  });
  g.nodes.forEach((n, i) => {
    const P = laid[i]; const x = P.x - P.w / 2, y = P.y - P.h / 2;
    const { inF, outF } = flows;
    // consumer short of what it needs / producer that cannot get rid of its output
    let state = '';
    for (const io of n.io || []) { if (io.d && (inF[i][io.i] || 0) < io.d - tol(io.d)) state = 'starve'; else if (!state && io.s && (outF[i][io.i] || 0) < io.s - tol(io.s)) state = 'backed'; }
    // blueprint ports and open ends nothing flows through are only possible connections: faded
    const idle = ['in', 'out', 'io'].includes(n.t) && !Object.keys(inF[i]).length && !Object.keys(outF[i]).length;
    const hl = fn.has(i), sel = selected === i;
    const portish = ['in', 'out', 'io'].includes(n.t), openish = n.t === 'end' || n.t === 'start';
    const shape = `${portish ? 'fill-depot-bg stroke-depot-bg' : openish ? 'fill-panel stroke-warn' : 'fill-panel-2'} ${state === 'starve' ? 'stroke-err' : state === 'backed' ? 'stroke-warn' : !portish && !openish ? (sel ? 'stroke-fg' : 'stroke-line group-hover:stroke-fg') : ''}`;
    const sw = state ? 2.2 : sel ? 2 : 1.2;
    const dash = openish ? '3 2' : ['sink', 'store', 'ext'].includes(n.t) ? '4 2' : undefined;
    const props = {
      className: `group cursor-pointer ${idle ? 'opacity-45' : ''}`,
      onPointerEnter: showTip(<NodeTip g={g} i={i} flows={flows} />), onPointerLeave: hideTip,
      onClick: () => { if (!dragged.current) onSelect(i); },
    };
    const halo = hl ? (ROUND.has(n.t) ? <circle r="22" className="fill-none stroke-hl" strokeWidth="2.5" /> : <rect x="-5" y="-5" width={P.w + 10} height={P.h + 10} rx="9" className="fill-none stroke-hl" strokeWidth="2.5" />) : null;
    const img = (k: string, s: number, ix: number, iy: number) => hasIcon(k) ? <image href={iconUrl(k)} x={ix} y={iy} width={s} height={s} /> : null;
    if (BOX.has(n.t)) {
      const rates: ReactNode[] = []; let rx = 46;
      for (const io of (n.io || []).slice(0, 3)) {
        const got = inF[i][io.i] || 0, used = outF[i][io.i] || 0;
        if (hasIcon(io.i)) { rates.push(<image key={`i${io.i}`} href={iconUrl(io.i)} x={rx} y="40" width="13" height="13" />); rx += 15; }
        const parts: ReactNode[] = []; let plain = '';
        if (io.s) { const t = `+${num(io.s)}`; plain += t; parts.push(<tspan key="s" className={used < io.s - tol(io.s) ? 'fill-warn font-bold' : 'fill-pos'}>{t}</tspan>); }
        if (io.d) {
          const short = got < io.d - tol(io.d); const t = `−${num(io.d)}${short ? ` (${num(got)})` : ''}`; plain += (plain ? ' ' : '') + t;
          parts.push(<tspan key="d" className={short ? 'fill-err font-bold' : 'fill-muted'}>{io.s ? ' ' : ''}{t}</tspan>);
        }
        rates.push(<text key={`t${io.i}`} x={rx} y="51" className="font-mono font-medium text-2xs">{parts}</text>); rx += plain.length * 6.3 + 8;
      }
      nodes.push(
        <g key={i} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} {...props}>
          {halo}<rect width={P.w} height={P.h} rx="5" className={shape} strokeWidth={sw} strokeDasharray={dash} />{img(n.c, 32, 7, 13)}
          <text x="46" y="18" className="font-body font-semibold text-[12.5px] fill-fg">{short(n.n, 22)}</text>
          {n.r && <text x="46" y="32" className="font-body text-2xs fill-muted">{short(n.r, 26)}</text>}{rates}
        </g>);
    } else if (ROUND.has(n.t)) {
      nodes.push(
        <g key={i} transform={`translate(${P.x.toFixed(1)},${P.y.toFixed(1)})`} {...props}>
          {halo}<circle r="16" className={shape} strokeWidth={sw} />
          {img(n.c, 22, -11, -11) ?? <text y="4" textAnchor="middle" className="font-head font-bold text-xs fill-muted">{n.t === 'split' ? 'S' : n.t === 'merge' ? 'M' : n.t === 'pump' ? 'P' : n.t === 'valve' ? 'V' : 'J'}</text>}
        </g>);
    } else {
      const label = n.t === 'in' ? 'IN' : n.t === 'out' ? 'OUT' : n.t === 'io' ? 'I/O' : 'OPEN';
      nodes.push(
        <g key={i} transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`} {...props}>
          {halo}<rect width={P.w} height={P.h} rx="11" className={shape} strokeWidth={sw} strokeDasharray={dash} />
          <text x={P.w / 2} y="15" textAnchor="middle" className={`font-head font-bold text-[10px] tracking-[.08em] ${openish ? 'fill-warn' : 'fill-depot-fg'}`}>{label}</text>
        </g>);
    }
  });
  const ctlBtn = 'border border-line bg-panel-2 text-fg rounded min-w-[30px] h-7 px-2 cursor-pointer font-body font-semibold text-sm hover:bg-head';
  return (
    <div ref={box} className="relative h-[clamp(260px,56vh,640px)] max-sm:h-[62vh] border border-line rounded bg-bg overflow-hidden touch-none cursor-grab">
      <svg ref={svg} className="size-full block select-none" xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`} role="img" aria-label={`${g.kind} network diagram: ${g.nodes.length} nodes`}>
        <defs>{(['n', 'err', 'warn', 'hl', 'faint'] as Tone[]).map(k => (
          <marker key={k} id={`ar-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1.5 9 5 0 8.5z" className={ARROW_FILL[k]} /></marker>))}
        </defs>
        <g>{edges}{labels}{nodes}</g>
      </svg>
      <div data-ctl className="absolute right-2 top-2 flex gap-1">
        <button type="button" className={ctlBtn} onClick={() => ctl.current?.zoom(1.3)} aria-label="Zoom in">+</button>
        <button type="button" className={ctlBtn} onClick={() => ctl.current?.zoom(1 / 1.3)} aria-label="Zoom out">−</button>
        <button type="button" className={ctlBtn} onClick={() => ctl.current?.fit()}>Fit</button>
      </div>
    </div>
  );
}
