// One shared tooltip for the page. useTip() gives the pointer handlers to put on any element (SVG included).
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TipApi { show(content: ReactNode, el: Element): void; hide(): void; suppress(on: boolean): void }
const TipContext = createContext<TipApi>({ show() {}, hide() {}, suppress() {} });

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<{ content: ReactNode; rect: DOMRect } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const suppressed = useRef(false);
  const api = useMemo<TipApi>(() => ({
    show(content, el) { if (!suppressed.current) setTip({ content, rect: el.getBoundingClientRect() }); },
    hide() { setTip(null); },
    suppress(on) { suppressed.current = on; if (on) setTip(null); },
  }), []);
  useLayoutEffect(() => {
    const el = box.current; if (!el || !tip) return;
    const r = tip.rect; const w = el.offsetWidth, h = el.offsetHeight;
    const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    let y = r.bottom + 8; if (y + h > window.innerHeight - 8) y = r.top - h - 8;
    el.style.left = `${x}px`; el.style.top = `${Math.max(8, y)}px`; el.style.visibility = 'visible';
  }, [tip]);
  useEffect(() => {
    const hide = () => setTip(null);
    document.addEventListener('scroll', hide, true);
    return () => document.removeEventListener('scroll', hide, true);
  }, []);
  return (
    <TipContext.Provider value={api}>
      {children}
      {tip && createPortal(
        <div ref={box} role="tooltip" style={{ visibility: 'hidden' }}
          className="fixed z-50 max-w-[min(380px,calc(100vw-16px))] px-2.5 py-2 bg-panel-2 border border-line rounded shadow-panel text-sm pointer-events-none [&_p]:mt-1.5">
          {tip.content}
        </div>, document.body)}
    </TipContext.Provider>
  );
}

export const useTooltip = () => useContext(TipContext);

/** Pointer handlers that show content (a node, or a function computing it on hover) next to the element. */
export function useTip(content: ReactNode | (() => ReactNode)) {
  const t = useTooltip();
  return {
    onPointerEnter: useCallback((e: React.PointerEvent) => t.show(typeof content === 'function' ? (content as () => ReactNode)() : content, e.currentTarget), [t, content]),
    onPointerLeave: useCallback(() => t.hide(), [t]),
  };
}

/** Inline element with a tooltip. */
export function Tip({ tip, className, children, label }: { tip: ReactNode | (() => ReactNode); className?: string; children: ReactNode; label?: string }) {
  const h = useTip(tip);
  return <span className={className} aria-label={label} {...h}>{children}</span>;
}
