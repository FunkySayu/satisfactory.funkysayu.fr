// Raw save objects (as produced by @etothepii/satisfactory-file-parser) and small helpers to read them.

/** A raw object from a save or blueprint. Properties are dynamic: read them with prop() / num() / ref(). */
export interface SaveObject {
  instanceName: string;
  typePath: string;
  properties?: Record<string, any>;
  specialProperties?: any;
  transform?: { translation: Vec3; rotation: Quat };
  /** Set on the virtual terminals that stand for a blueprint's open ports. */
  virtual?: 'in' | 'out' | 'io';
  fluid?: boolean;
  /** Virtual terminals: the part whose port is open. */
  on?: SaveObject;
}
export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }

/** Class name, e.g. "Build_ConveyorBeltMk3_C". */
export const cls = (o: SaveObject): string => { const t = o.typePath; return t.slice(t.lastIndexOf('.') + 1); };
/** Owner of a component path ("A.B.Comp" -> "A.B"). */
export const owner = (p: string) => p.slice(0, p.lastIndexOf('.'));
/** Last segment of a path. */
export const leaf = (p: string) => p.slice(p.lastIndexOf('.') + 1);
/** Short id shown to the player: the numeric suffix of an instance name. */
export const sid = (n: string) => n.slice(n.lastIndexOf('_') + 1);

export const val = (p: any) => p === undefined ? undefined : (p.value !== undefined ? p.value : p.values);
export const prop = (o: SaveObject | undefined, k: string): any => o?.properties ? val(o.properties[k]) : undefined;
/** BoolProperty true = tag flag 0x10. */
export const bool = (o: SaveObject | undefined, k: string) => !!((o?.properties?.[k]?.flags ?? 0) & 16);
export const num = (o: SaveObject | undefined, k: string, d: number) => { const v = prop(o, k); return typeof v === 'number' ? v : d; };
export const ref = (o: SaveObject | undefined, k: string): string | undefined => prop(o, k)?.pathName || undefined;
/** Clock the player set: blueprints only store mPendingPotential; in saves it is the target mCurrentPotential converges to. */
export const clockOf = (o: SaveObject) => { const p = prop(o, 'mPendingPotential'); return typeof p === 'number' ? p : num(o, 'mCurrentPotential', 1); };

/** Position in metres, rounded. */
export const xyz = (o: SaveObject | undefined): number[] => {
  const t = o?.transform?.translation;
  return t ? [Math.round(t.x / 100), Math.round(t.y / 100), Math.round(t.z / 100)] : [0, 0, 0];
};

export function rotate(q: Quat, v: Vec3): Vec3 {
  const { x: qx, y: qy, z: qz, w: qw } = q;
  const ix = qw * v.x + qy * v.z - qz * v.y, iy = qw * v.y + qz * v.x - qx * v.z,
    iz = qw * v.z + qx * v.y - qy * v.x, iw = -qx * v.x - qy * v.y - qz * v.z;
  return { x: ix * qw + iw * -qx + iy * -qz - iz * -qy, y: iy * qw + iw * -qy + iz * -qx - ix * -qz, z: iz * qw + iw * -qz + ix * -qy - iy * -qx };
}

// ---------------------------------------------------------------- numbers
export const round = (v: number) => Math.round(v * 100) / 100;
/** Compact number for messages: integers stay integers, else one decimal. */
export const fmt = (v: number) => (Math.abs(v - Math.round(v)) < 0.01 ? Math.round(v) : v.toFixed(1)).toString();
/** Tolerance used when comparing rates. */
export const tol = (v: number) => Math.max(0.05, Math.abs(v) * 1e-3);

// ---------------------------------------------------------------- collections
export const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => { (m.get(k) ?? m.set(k, []).get(k)!).push(v); };

/** Union-find over string keys. */
export class UnionFind {
  private p = new Map<string, string>();
  find(a: string): string {
    let r = a;
    for (;;) { const n = this.p.get(r); if (n === undefined) { this.p.set(r, r); return r; } if (n === r) break; r = n; }
    let x = a; while (x !== r) { const n = this.p.get(x)!; this.p.set(x, r); x = n; }
    return r;
  }
  union(a: string, b: string) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}

/** Every object by instance name. Virtual objects (blueprint ports) are added to it while the model is built. */
export class ObjectIndex {
  readonly byName = new Map<string, SaveObject>();
  constructor(readonly objects: SaveObject[]) { for (const o of objects) this.byName.set(o.instanceName, o); }
  get(name: string): SaveObject | undefined { return this.byName.get(name); }
  /** Lookup of a name known to exist. */
  at(name: string): SaveObject { return this.byName.get(name)!; }
  has(name: string) { return this.byName.has(name); }
  add(o: SaveObject) { this.byName.set(o.instanceName, o); }
  ofClass(c: string) { return this.objects.filter(o => cls(o) === c); }
}
