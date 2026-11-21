// Per-building facts used across the model and by the analyzers: names, productivity, details, somersloops.
import { clockOf, fmt, leaf, num, prop, ref, sid, val, type ObjectIndex, type SaveObject } from './objects';
import type { Names } from './gamedata';
import type { PowerGrid } from './power';

const pct = (v: number) => `${fmt(v * 100)}%`;

export class Buildings {
  constructor(private idx: ObjectIndex, private names: Names, private power: PowerGrid, private blueprint: boolean) {}

  name(o: SaveObject) { return this.names.building(o); }
  recipe(o: SaveObject) { return this.names.recipe(o); }
  /** Share of the last ~5 minutes the building was producing (null = not measured). */
  productivity(b: SaveObject): number | null {
    const d = num(b, 'mLastProductivityMeasurementDuration', 0);
    return d > 0 ? num(b, 'mLastProductivityMeasurementProduceDuration', 0) / d : null;
  }
  currentProductivity(b: SaveObject) {
    return num(b, 'mCurrentProductivityMeasurementProduceDuration', 0) / (num(b, 'mCurrentProductivityMeasurementDuration', 0) || 1);
  }
  /** Buildings placed from a blueprint point at an FGBlueprintProxy that holds the blueprint's name (saves only). */
  blueprintOf(o: SaveObject | undefined): string | undefined {
    if (this.blueprint || !o) return undefined;
    const px = this.idx.get(ref(o, 'mBlueprintProxy') || ''); const v = prop(px, 'mBlueprintName');
    return (typeof v === 'string' ? v : v?.value) || undefined;
  }
  /** Key / value rows describing a building (shown with the issues about it). */
  details(o: SaveObject): [string, string][] {
    const kv: [string, string][] = [['Building', this.name(o)], ['ID', sid(o.instanceName)]];
    const r = this.recipe(o); if (r) kv.push([this.power.isGen(o) ? 'Fuel' : 'Recipe', r]);
    if (this.power.pinfo.has(o.instanceName) || (o.properties?.mCurrentPotential || o.properties?.mPendingPotential)) kv.push(['Clock', pct(clockOf(o))]);
    if (!this.blueprint) { const p = this.productivity(o); if (p !== null) kv.push(['Productivity', `${pct(p)} last ~5 min, ${pct(this.currentProductivity(o))} now`]); }
    if (this.power.pinfo.has(o.instanceName)) {
      kv.push(['Power', !this.power.wired.has(o.instanceName) ? 'no wire' : this.blueprint ? 'wired' : this.power.onMainGrid(o.instanceName) ? 'reaches the main grid' : 'not connected to the main grid']);
    }
    return kv;
  }
  /** Somersloops slotted in a building. */
  sloops(b: SaveObject) {
    const inv = this.idx.get(b.instanceName + '.InventoryPotential'); let n = 0;
    for (const st of prop(inv, 'mInventoryStacks') || []) {
      const it = st.properties?.Item?.value?.itemReference?.pathName || '';
      if (/Desc_WAT1_C$/.test(it)) n += val(st.properties.NumItems) || 0;
    }
    return n;
  }
  /** Items sitting in a building's storage inventory. */
  storedItems(b: SaveObject): string[] {
    const inv = this.idx.get(b.instanceName + '.StorageInventory'); const out = new Set<string>();
    for (const st of prop(inv, 'mInventoryStacks') || []) {
      const it = st.properties?.Item?.value?.itemReference?.pathName;
      if (it && (val(st.properties.NumItems) || 0) > 0) out.add(leaf(it));
    }
    return [...out];
  }
}
