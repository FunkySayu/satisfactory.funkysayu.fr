// UI glyphs (inline SVG) and game icons (PNG files served from icons/).
import type { Severity } from '../../report/types';
import { useApp } from '../store';

type P = { className?: string };
const base = 'size-4 flex-none';

export function ErrorIcon({ className = '' }: P) {
  return <svg className={`${base} ${className}`} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" className="fill-err" /><rect x="8.9" y="4.6" width="2.2" height="7.4" rx="1.1" className="fill-white" /><circle cx="10" cy="14.9" r="1.35" className="fill-white" /></svg>;
}
export function WarnIcon({ className = '' }: P) {
  return <svg className={`${base} ${className}`} viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.6 19 17.6H1z" strokeLinejoin="round" className="fill-warn stroke-warn" strokeWidth="1.5" /><rect x="9" y="6.6" width="2" height="6" rx="1" fill="#1b1b1b" /><circle cx="10" cy="14.9" r="1.2" fill="#1b1b1b" /></svg>;
}
export function InfoIcon({ className = '' }: P) {
  return <svg className={`${base} ${className}`} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2" className="fill-none stroke-info" strokeWidth="1.6" /><rect x="9" y="8.6" width="2" height="6.2" rx="1" className="fill-info" /><circle cx="10" cy="5.9" r="1.2" className="fill-info" /></svg>;
}
export function OkIcon({ className = '' }: P) {
  return <svg className={`${base} ${className}`} viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8.2" className="fill-none stroke-pos" strokeWidth="1.6" /><path d="m6.2 10.3 2.6 2.6 5-5.4" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-pos" /></svg>;
}
export function SevIcon({ sev, className }: { sev: Severity | 'ok'; className?: string }) {
  return sev === 'error' ? <ErrorIcon className={className} /> : sev === 'warn' ? <WarnIcon className={className} /> : sev === 'info' ? <InfoIcon className={className} /> : <OkIcon className={className} />;
}
export function CopyIcon({ className = '' }: P) {
  return <svg className={`size-3 flex-none ${className}`} viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M13 4.5V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}
export function BoltIcon({ className = '' }: P) {
  return <svg className={`${base} ${className}`} viewBox="0 0 20 20" aria-hidden="true"><path d="M11.6 1.5 4 11.2h5l-1.3 7.3 7.9-10.1h-5.1z" fill="currentColor" /></svg>;
}
export function ChevronIcon({ className = '' }: P) {
  return <svg className={`size-3.5 flex-none text-muted transition-transform ${className}`} viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4.5 5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
export function NetIcon({ className = '' }: P) {
  return <svg className={`${base} text-muted ${className}`} viewBox="0 0 20 20" aria-hidden="true" fill="currentColor"><circle cx="4" cy="10" r="2.2" /><circle cx="16" cy="4.5" r="2.2" /><circle cx="16" cy="15.5" r="2.2" /><path d="M6 10c4 0 4-5.5 8-5.5M6 10c4 0 4 5.5 8 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
}
export function MapIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4"><path d="M2.5 5.2 7.3 3l5.4 2.2L17.5 3v11.8l-4.8 2.2-5.4-2.2-4.8 2.2z M7.3 3v11.8 M12.7 5.2V17" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>;
}
export function ThemeIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true" className="size-4"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M10 2.8a7.2 7.2 0 0 1 0 14.4z" fill="currentColor" /></svg>;
}

/** Switch state as a status glyph (not a control): green power symbol when on, red and struck through when off. */
export function PowerGlyph({ on, size = 'size-[18px]', knockout = 'stroke-panel' }: { on: boolean; size?: string; knockout?: string }) {
  return (
    <span className={`inline-flex flex-none ${size}`} role="img" aria-label={on ? 'Switch on' : 'Switch off'}>
      <svg viewBox="0 0 20 20" aria-hidden="true" className={`${size} fill-none`} strokeLinecap="round">
        <path d="M6.1 5.7a6.1 6.1 0 1 0 7.8 0" strokeWidth="2.2" className={on ? 'stroke-pos' : 'stroke-err'} />
        <path d="M10 2.7v6.4" strokeWidth="2.2" className={on ? 'stroke-pos' : 'stroke-err'} />
        {!on && <><path d="M3.6 3.6 16.4 16.4" strokeWidth="5.5" className={knockout} /><path d="M3.6 3.6 16.4 16.4" strokeWidth="2.2" className="stroke-err" /></>}
      </svg>
    </span>
  );
}

export const SLOOP = 'Desc_WAT1_C', MERCER = 'Desc_WAT2_C', AUGMENTER = 'Build_AlienPowerBuilding_C';
export const iconUrl = (k: string) => `${import.meta.env.BASE_URL}icons/${k}.png`;
export function useHasIcon() { const icons = useApp(s => s.icons); return (k: string) => icons.has(k); }

/** Game icon of an item or building; nothing when there is none. */
export function GameIcon({ k, className = 'size-4', alt = '' }: { k: string; className?: string; alt?: string }) {
  const has = useHasIcon();
  if (!k || !has(k)) return null;
  return <img src={iconUrl(k)} alt={alt} className={`inline-block flex-none object-contain align-middle ${className}`} loading="lazy" />;
}
