// Number and text formatting for the page.
import type { Issue, PowerSum } from '../../report/types';

export const mw = (v: number) => `${Math.round(v).toLocaleString('en-US')} MW`;
export const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v)).toLocaleString('en-US')} MW`;
export const num = (v: number) => (Math.abs(v - Math.round(v)) < 0.05 ? Math.round(v) : v.toFixed(1)).toLocaleString();
export const coords = (at?: number[]) => at ? at.join(', ') : '';
export const plural = (n: number, w: string) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : (/(s|sh|ch|x)$/.test(w) ? 'es' : 's')}`;
export const tally = (l: Issue[]) => [l.filter(i => i.sev === 'error').length, l.filter(i => i.sev === 'warn').length] as const;
export const tol = (v: number) => Math.max(0.05, Math.abs(v) * 1e-3);

/** pos / neg / zero for the current delta. */
export const deltaTone = (v: number) => Math.abs(v) < 0.5 ? 'zero' : v > 0 ? 'pos' : 'neg';
export const TONE_TEXT = { pos: 'text-pos', neg: 'text-neg', zero: 'text-muted' } as const;
export const deltaClass = (p: PowerSum) => TONE_TEXT[deltaTone(p.gen - p.draw)];

/** Same problem at several places: drop positions and building ids from the text. */
export const issueTemplate = (m: string) => m.replace(/ near \([^)]*\)/g, '').replace(/ at \([^)]*\)/g, '').replace(/\b\d{6,}\b/g, '').replace(/\s{2,}/g, ' ').replace(/ ([,.:;)])/g, '$1');
export const issueKey = (i: Issue) => `${i.sev}|${i.msg}|${coords(i.at)}`;

export const sumPower = (l: PowerSum[]): PowerSum => l.reduce((a, p) => ({
  gen: a.gen + p.gen, draw: a.draw + p.draw, maxGen: a.maxGen + p.maxGen, maxDraw: a.maxDraw + p.maxDraw,
  gens: a.gens + p.gens, idleGens: a.idleGens + p.idleGens, consumers: a.consumers + p.consumers,
}), { gen: 0, draw: 0, maxGen: 0, maxDraw: 0, gens: 0, idleGens: 0, consumers: 0 });
