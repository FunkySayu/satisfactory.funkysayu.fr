// Page parameters and links to the Satisfactory Calculator interactive map.
//   ?url=<save>          the save to load (same parameter as the SCIM map: it reads it encoded once, its address bar shows it encoded twice)
//   ?bp_url=<archive>    a blueprint folder packed as .tar or .tar.gz
//   ?snapshot=<json>     a pre-computed report (scratch/scripts/snapshot.ts)
//   ?live_reload=1       check the URLs every second and reload what changed
const params = new URLSearchParams(location.search);

const urlParam = (k: string) => {
  try {
    let u = params.get(k); if (!u) return null;
    for (let i = 0; i < 3 && /^https?%3A/i.test(u); i++) u = decodeURIComponent(u);
    if (/^https?:\/\//i.test(u)) return u;
    return /^\/[^/]/.test(u) ? new URL(u, location.origin).href : null; // same-server path, e.g. /data/latest.sav
  } catch { return null; }
};

export const SAVE_URL = urlParam('url');
export const BP_URL = urlParam('bp_url');
export const SNAPSHOT_URL = urlParam('snapshot');
export const LIVE_RELOAD = (() => { const v = params.get('live_reload'); return v !== null && !/^(0|false|no|off|)$/i.test(v.trim()); })();

export const SCIM_MAP = 'https://satisfactory-calculator.com/en/interactive-map';
/** SCIM map position: zoom;x;y in game units (cm). The map ignores it on load (it jumps to the player), so it is offered to copy. */
export const scimPos = (at: number[]) => `10;${Math.round(at[0] * 100)};${Math.round(at[1] * 100)}`;
export const mapUrl = (at?: number[]) => `${SCIM_MAP}${SAVE_URL ? `?url=${encodeURIComponent(SAVE_URL)}` : ''}${at ? `#${scimPos(at)}` : ''}`;
export const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };
