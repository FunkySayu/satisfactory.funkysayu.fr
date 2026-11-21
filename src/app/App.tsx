// Page shell: header, empty state / loading, the three views, the drawer and the modal.
import { useEffect, useState } from 'react';
import { droppedFiles } from './lib/files';
import { loadFiles } from './loader';
import { getState, go, hasData, setState, useApp, type ViewName } from './store';
import { Header } from './components/Header';
import { EmptyState } from './components/EmptyState';
import { Drawer } from './components/Drawer';
import { IssueModal } from './components/IssueModal';
import { Count, useBlockMW } from './components/ui';
import { Board, ScaleLegend } from './views/Board';
import { Aggregated } from './views/Aggregated';
import { Blueprints } from './views/Blueprints';

function Meta() {
  const m = useApp(s => s.report?.meta);
  if (!m) return null;
  return (
    <p className="m-0 ml-auto text-muted text-sm flex gap-x-3.5 gap-y-1.5 flex-wrap">
      <span className="text-fg font-semibold">{m.session}</span><span>{m.file}</span>
      {m.savedAt && <span>saved {new Date(m.savedAt).toLocaleString()}</span>}
      {m.playHours != null && <span title="Play time recorded in the save">{Math.floor(m.playHours).toLocaleString('en-US')} h {String(Math.floor((m.playHours % 1) * 60)).padStart(2, '0')} min played</span>}
    </p>
  );
}

function Tabs() {
  const view = useApp(s => s.view); const report = useApp(s => s.report); const bps = useApp(s => s.blueprints.length);
  const tab = (id: ViewName, label: React.ReactNode) => (
    <button type="button" role="tab" aria-selected={view === id} disabled={id !== 'blueprints' && !report} onClick={() => go(id)}
      className={`border-0 px-3.5 py-1.5 rounded-[3px] cursor-pointer font-medium inline-flex gap-1.5 items-center disabled:opacity-45 disabled:cursor-default ${view === id ? 'bg-head text-fg' : 'bg-transparent text-muted'}`}>{label}</button>
  );
  return (
    <div className="flex gap-0.5 bg-panel border border-line rounded p-0.5" role="tablist">
      {tab('switches', 'Per priority switch')}{tab('aggregated', 'Aggregated view')}{tab('blueprints', <>Blueprints {bps > 0 && <Count>{bps}</Count>}</>)}
    </div>
  );
}

function Main() {
  const report = useApp(s => s.report); const bps = useApp(s => s.blueprints.length);
  const view = useApp(s => s.view); const aggTab = useApp(s => s.aggTab);
  const step = useBlockMW();
  // no save but blueprints: the blueprints tab is the only one
  const shown: ViewName = !report && bps ? 'blueprints' : view;
  return (
    <main className="grid gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs />
        {shown === 'switches' && <ScaleLegend step={step} />}
        <Meta />
      </div>
      {shown === 'switches' && report && <Board report={report} step={step} />}
      {shown === 'aggregated' && report && <Aggregated report={report} tab={aggTab} />}
      {shown === 'blueprints' && <Blueprints />}
    </main>
  );
}

function Loading() {
  const l = useApp(s => s.loading);
  if (!l) return null;
  return (
    <div className="grid gap-2 justify-items-center py-6 text-muted">
      <div className="w-[min(420px,100%)] h-1.5 rounded-[3px] bg-panel-2 overflow-hidden"><i className="block h-full bg-fg transition-[width] duration-200" style={{ width: `${Math.round(l.p * 100)}%` }} /></div>
      <span>{l.msg}</span>
    </div>
  );
}

/** Drop a save or blueprint files / folders anywhere on the page. */
function useDropZone() {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const drop = (e: DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer) droppedFiles(e.dataTransfer).then(loadFiles); };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    document.addEventListener('dragover', over); document.addEventListener('drop', drop); document.addEventListener('dragleave', leave);
    return () => { document.removeEventListener('dragover', over); document.removeEventListener('drop', drop); document.removeEventListener('dragleave', leave); };
  }, []);
  return dragging;
}

export function App() {
  const data = useApp(hasData); const loading = useApp(s => !!s.loading); const error = useApp(s => s.error);
  const dragging = useDropZone();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = getState(); if (s.modal) setState({ modal: null }); else if (s.open) setState({ open: null });
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, []);
  return (
    <div className={dragging ? 'dragging' : ''}>
      <div className="grid gap-4 max-w-[1680px] mx-auto pt-5 pb-10 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))]">
        <Header />
        {error && <p role="alert" className="m-0 px-3.5 py-2.5 border border-err rounded text-err bg-panel">{error}</p>}
        {!data && !loading && <EmptyState />}
        <Loading />
        {data && <Main />}
      </div>
      <Drawer />
      <IssueModal />
      {dragging && <div aria-hidden="true" className="fixed inset-0 z-[60] grid place-items-center bg-black/55 text-white font-head font-semibold text-[26px]">Drop a .sav, or blueprint files / folder</div>}
    </div>
  );
}
