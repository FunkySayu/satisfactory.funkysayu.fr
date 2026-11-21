import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { TooltipProvider } from './components/Tooltip';
import { boot } from './loader';
import { applyHash } from './store';

applyHash();
window.addEventListener('hashchange', applyHash);
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider><App /></TooltipProvider>
  </StrictMode>,
);
boot();
