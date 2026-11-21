// Per-browser preferences. Storage can be unavailable (private windows, blocked site data): every access is guarded.
export function readPref(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writePref(key: string, value: string | null) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
export const PREF = { theme: 'sf-theme', done: 'sf-done', bpMult: 'sf-bp-mult' } as const;

export function readDone(): Set<string> { try { return new Set(JSON.parse(readPref(PREF.done) || '[]')); } catch { return new Set(); } }
export function writeDone(s: Set<string>) { writePref(PREF.done, JSON.stringify([...s])); }
