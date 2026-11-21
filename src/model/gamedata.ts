// Game data the model needs (built by scratch/scripts/build-gamedata.mjs into src/static/gamedata.json) and naming helpers.
import { cls, leaf, ref, type SaveObject } from './objects';

export interface GameData {
  /** n: display name, f: 1 for fluids, e: energy (MJ per item, per litre for fluids) */
  items: Record<string, { n: string; f: number; e: number }>;
  /** per-cycle amounts (fluids in m³), d: cycle duration in s */
  recipes: Record<string, { n: string; d: number; i: Record<string, number>; o: Record<string, number> }>;
  /** pu: base power used, pg: base power generated (MW) */
  buildings: Record<string, { n: string; pu?: number; pg?: number; fuels?: string[]; sup?: string }>;
  /** resource node path leaf -> [item class, purity multiplier] */
  nodes: Record<string, [string, number]>;
}

export const purityName = (m: number) => m === 0.5 ? 'Impure' : m === 2 ? 'Pure' : 'Normal';

const VIRTUAL_NAME: Record<string, string> = { in: 'Blueprint input', out: 'Blueprint output', io: 'Blueprint pipe end' };

/** Display names of buildings, items and recipes. */
export class Names {
  constructor(private gd: GameData) {}
  building(o: SaveObject): string {
    if (o.virtual) return VIRTUAL_NAME[o.virtual];
    const c = cls(o); return this.gd.buildings[c]?.n ?? c.replace(/^Build_/, '').replace(/_C$/, '');
  }
  item(i: string): string { return this.gd.items[i]?.n ?? i.replace(/^Desc_/, '').replace(/_C$/, ''); }
  isFluid(i: string) { return !!this.gd.items[i]?.f; }
  /** Recipe, extracted resource or fuel of a building ('' when none). */
  recipe(b: SaveObject): string {
    const C = cls(b); const r = ref(b, 'mCurrentRecipe');
    if (r) return this.gd.recipes[leaf(r)]?.n ?? leaf(r).replace(/^Recipe_/, '').replace(/_C$/, '');
    const np = ref(b, 'mExtractableResource');
    if (np) { const n = this.gd.nodes[leaf(np)]; if (n) return `${this.item(n[0])} (${purityName(n[1])})`; }
    if (C === 'Build_WaterPump_C') return 'Water';
    const bd = this.gd.buildings[C]; if (bd?.pg && bd.fuels) return this.item(leaf(ref(b, 'mCurrentFuelClass') || bd.fuels[0]));
    return '';
  }
}
