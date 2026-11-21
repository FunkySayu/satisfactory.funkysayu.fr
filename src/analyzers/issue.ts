// Helpers to build issues and the diagram views attached to them.
import { sid, xyz, type Network, type SatisfactorySave, type SaveObject } from '../model/satisfactory_save';
import type { Category, Issue, Severity, View } from './types';

/** An issue pointing at a building (anchor). The subject defaults to that building. */
export function makeIssue(save: SatisfactorySave, sev: Severity, cat: Category, code: string, msg: string, anchor?: SaveObject, more: Partial<Issue> = {}): Issue {
  return {
    sev, cat, code, msg,
    subject: anchor ? { kind: 'building', name: anchor.instanceName } : { kind: 'save' },
    at: anchor ? xyz(anchor) : undefined, id: anchor ? sid(anchor.instanceName) : undefined, bp: save.buildings.blueprintOf(anchor),
    ...more,
  };
}

/** Diagram view of a network highlighting these buildings / parts. */
export function networkView(n: Network, names: string[], parts: string[] = []): View {
  const { nodes, edges } = n.locate(names, parts);
  return { g: n.index, n: nodes, e: edges };
}

/** Diagram views of every network a building (terminal) or a part sits in, highlighting it. Belts first. */
export function viewsFor(save: SatisfactorySave, names: string[]): View[] {
  const m = new Map<number, View>();
  for (const k of names) {
    const part = save.networks.ofPart(k);
    for (const n of [...save.networks.of(k), ...(part ? [part] : [])]) {
      const v = m.get(n.index) ?? m.set(n.index, { g: n.index, n: [], e: [] }).get(n.index)!;
      const { nodes, edges } = n.locate([k]); v.n!.push(...nodes); v.e!.push(...edges);
    }
  }
  return [...m.values()].sort((a, b) => save.networks.graphs[a.g].kind.localeCompare(save.networks.graphs[b.g].kind));
}

/** "Name at (x, y, z)". */
export const where = (save: SatisfactorySave, o: SaveObject) => `${save.names.building(o)} at (${xyz(o).join(', ')})`;
export const plural = (n: number, s = 's') => n > 1 ? s : '';
