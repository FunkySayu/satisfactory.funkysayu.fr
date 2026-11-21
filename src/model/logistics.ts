// Belts and pipes: connection ports, the directed belt graph, the undirected pipe graph, part capacities, and
// (blueprints) the open ports that become the blueprint's inputs / outputs.
import { cls, leaf, owner, prop, num, ref, rotate, val, push, type ObjectIndex, type SaveObject } from './objects';

export const BELT_SPEED: Record<string, number> = { Mk1: 60, Mk2: 120, Mk3: 270, Mk4: 480, Mk5: 780, Mk6: 1200 };
/** Sinks that take any amount. */
export const UNLIMITED_SINKS = /^Build_(ResourceSink|CentralStorage|SpaceElevator)_C$/;
/** Stations and storage whose rates are unknown (items come from or go to elsewhere). */
export const EXTERNAL = /^Build_(TrainDockingStation|TrainDockingStationLiquid|TruckStation|FluidTruckStation|DroneStation|StorageIntegrated|StoragePlayer)_C$/;
export const BUFFER = /^Build_(StorageContainerMk\d|PipeStorageTank|IndustrialTank)_C$/;
export const BELT_PART = /^Build_Conveyor(Belt|Lift)Mk\d_C$/;
const PIPE_TRANSPORT = /^Build_(Pipeline(MK2)?(_NoIndicator)?|PipelineJunction_\w+|PipelinePump(Mk2)?|Valve|PipelineFlowIndicator)_C$/;

/** One connection component of a building. to = the component it connects to (missing = open). */
export interface Port { comp: string; owner: string; name: string; to?: string }

export const isOutName = (n: string) => /^Output/i.test(n) || n === 'ConveyorAny1';
export const isInName = (n: string) => /^Input/i.test(n) || n === 'ConveyorAny0';

export class Logistics {
  readonly beltPorts = new Map<string, Port[]>();
  readonly pipePorts = new Map<string, Port[]>();
  /** Directed belt edges between buildings / parts. */
  readonly bOut = new Map<string, Set<string>>();
  readonly bIn = new Map<string, Set<string>>();
  /** Undirected pipe links. */
  readonly pAdj = new Map<string, Set<string>>();
  /** Blueprint boundary terminals (open ports), empty for a save. */
  readonly virtuals: SaveObject[] = [];

  constructor(private idx: ObjectIndex, blueprint: boolean) {
    for (const o of idx.objects) {
      const C = cls(o);
      const isBelt = C === 'FGFactoryConnectionComponent';
      const isPipe = C === 'FGPipeConnectionComponent' || C === 'FGPipeConnectionFactory';
      if (!isBelt && !isPipe) continue;
      const ow = owner(o.instanceName); const ob = idx.get(ow); if (!ob || /Hyper/i.test(cls(ob))) continue;
      let to = ref(o, 'mConnectedComponent'); if (to && !idx.has(owner(to))) to = undefined; // blueprints may reference parts outside the blueprint
      push(isBelt ? this.beltPorts : this.pipePorts, ow, { comp: o.instanceName, owner: ow, name: leaf(o.instanceName), to });
    }
    for (const ports of this.beltPorts.values()) for (const p of ports) {
      if (!p.to) continue; const other = owner(p.to);
      if (isOutName(p.name)) this.addBelt(p.owner, other); else if (isInName(p.name)) this.addBelt(other, p.owner);
      else { const on = leaf(p.to); if (isOutName(on)) this.addBelt(other, p.owner); else if (isInName(on)) this.addBelt(p.owner, other); }
    }
    for (const ports of this.pipePorts.values()) for (const p of ports) if (p.to) this.addPipe(p.owner, owner(p.to));
    if (blueprint) this.addBoundary();
  }

  private addBelt(a: string, b: string) {
    (this.bOut.get(a) ?? this.bOut.set(a, new Set()).get(a)!).add(b);
    (this.bIn.get(b) ?? this.bIn.set(b, new Set()).get(b)!).add(a);
  }
  private addPipe(a: string, b: string) { for (const [x, y] of [[a, b], [b, a]]) (this.pAdj.get(x) ?? this.pAdj.set(x, new Set()).get(x)!).add(y); }

  /** An open port on a belt, lift, splitter / merger input, merger output, pipe or junction is where the blueprint
   *  takes items in or gives them out once placed. Each becomes a virtual terminal. */
  private addBoundary() {
    const mk = (base: SaveObject, port: string, kind: 'in' | 'out' | 'io', fluid: boolean) => {
      const v: SaveObject = { instanceName: `${base.instanceName}.@${port}`, typePath: `/virtual.BP_${kind}`, transform: base.transform, virtual: kind, fluid, on: base };
      this.idx.add(v); this.virtuals.push(v); return v.instanceName;
    };
    for (const [ow, ports] of this.beltPorts) {
      const o = this.idx.at(ow); const C = cls(o);
      const belt = BELT_PART.test(C), split = /^Build_ConveyorAttachmentSplitter/.test(C), merge = /^Build_ConveyorAttachmentMerger/.test(C);
      if (!belt && !split && !merge) continue;
      for (const p of ports) if (!p.to) {
        if (isInName(p.name)) this.addBelt(mk(o, p.name, 'in', false), ow);
        else if (isOutName(p.name) && !split) this.addBelt(ow, mk(o, p.name, 'out', false)); // an open splitter output just stays unused
      }
    }
    for (const [ow, ports] of this.pipePorts) {
      const o = this.idx.at(ow); if (!this.isPipeTransport(o)) continue;
      for (const p of ports) if (!p.to) this.addPipe(ow, mk(o, p.name, 'io', true));
    }
  }

  beltCap(o: SaveObject): number | null { const m = cls(o).match(/^Build_Conveyor(?:Belt|Lift)(Mk\d)_C$/); return m ? BELT_SPEED[m[1]] : null; }
  /** m³/min a pipe carries, or a valve's user limit; null = no limit of its own. */
  pipeCap(o: SaveObject): number | null {
    const C = cls(o);
    if (/^Build_Pipeline/.test(C) && !/Junction|Pump|FlowIndicator/.test(C)) return /MK2/i.test(C) ? 600 : 300;
    return C === 'Build_Valve_C' && num(o, 'mUserFlowLimit', -1) >= 0 ? num(o, 'mUserFlowLimit', -1) * 60 : null;
  }
  /** Belts, lifts, splitters / mergers, and storage containers sitting in the middle of a line. */
  isBeltTransport(o: SaveObject): boolean {
    if (o.virtual) return false; const C = cls(o);
    if (BELT_PART.test(C) || /^Build_ConveyorAttachment/.test(C)) return true;
    return /^Build_StorageContainerMk\d_C$/.test(C) && (this.bIn.get(o.instanceName)?.size ?? 0) > 0 && (this.bOut.get(o.instanceName)?.size ?? 0) > 0;
  }
  isPipeTransport(o: SaveObject) { return !o.virtual && PIPE_TRANSPORT.test(cls(o)); }
  isPipeSegment(o: SaveObject) { return !o.virtual && /^Build_Pipeline(MK2)?(_NoIndicator)?_C$/.test(cls(o)); }
  isPump(o: SaveObject) { return !o.virtual && /^Build_PipelinePump/.test(cls(o)); }
  ports(name: string, fluid: boolean): Port[] { return (fluid ? this.pipePorts : this.beltPorts).get(name) || []; }

  // ---------------------------------------------------------------- pipe geometry (cm)
  /** Heights of a pipe's spline points. */
  splineZ(o: SaveObject): number[] {
    const zs: number[] = [];
    for (const pt of prop(o, 'mSplineData') || []) { const l = val(pt.properties?.Location); if (l) zs.push(o.transform!.translation.z + rotate(o.transform!.rotation, l).z); }
    return zs.length ? zs : [o.transform!.translation.z];
  }
  /** Highest point of a part. */
  topZ(o: SaveObject) { return this.isPipeSegment(o) ? Math.max(...this.splineZ(o)) : o.transform!.translation.z; }
  /** Height of the pipe end attached to a producer. */
  outletZ(t: SaveObject, members: Set<string>) {
    const port = (this.pipePorts.get(t.instanceName) || []).find(p => p.to && members.has(owner(p.to)));
    if (!port?.to) return t.transform!.translation.z;
    const pipe = this.idx.at(owner(port.to)); if (!this.isPipeSegment(pipe)) return pipe.transform!.translation.z;
    const pts = prop(pipe, 'mSplineData') || []; const end = port.to.endsWith('PipelineConnection0') ? pts[0] : pts[pts.length - 1];
    const l = end && val(end.properties?.Location); return l ? pipe.transform!.translation.z + rotate(pipe.transform!.rotation, l).z : pipe.transform!.translation.z;
  }
}
