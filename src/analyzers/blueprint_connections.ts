// Blueprints: every production machine is connected by belts and pipes; what is left open has to come from outside.
import { BUFFER, cls, fmt, sid } from '../model/satisfactory_save';
import type { Analyzer, Issue } from './types';
import { makeIssue, viewsFor } from './issue';

export const BLUEPRINT_CONNECTIONS_ANALYZER: Analyzer = {
  id: 'blueprint-connections',
  name: 'Blueprint connections',
  description: 'Every machine with a recipe has its belt and pipe inputs / outputs connected inside the blueprint.',
  targets: ['blueprint'],
  checks: {
    'bp.unconnected': { title: 'Machine not connected', why: 'This machine has a recipe but no belt or pipe connected at all inside the blueprint.', fix: 'Connect it, or remove it from the blueprint.' },
    'bp.openin': { title: 'Input open in the blueprint', why: "The recipe needs this input but none of the machine's ports for it is connected inside the blueprint. Fine if you connect it from outside after placing the blueprint.", fix: 'Connect the port inside the blueprint, or plan an outside line for it.' },
    'bp.openout': { title: 'Output open in the blueprint', why: 'The machine makes this item but its output is not connected inside the blueprint. It stops when full unless connected from outside.', fix: 'Connect the output inside the blueprint, or plan an outside line for it.' },
  },
  run(save) {
    const { logistics: lg, flows, names } = save;
    const out: Issue[] = [];
    const production = save.index.objects.filter(o => /^Build_/.test(cls(o)) && !lg.isBeltTransport(o) && !lg.isPipeTransport(o) && !BUFFER.test(cls(o))
      && (() => { const f = flows.of(o); return Object.keys(f.inp).length + Object.keys(f.out).length > 0; })());
    for (const o of production) {
      const f = flows.of(o); const k = o.instanceName;
      const anyConn = (lg.beltPorts.get(k) || []).some(p => p.to) || (lg.pipePorts.get(k) || []).some(p => p.to);
      if (!anyConn) {
        out.push(makeIssue(save, 'error', 'build', 'bp.unconnected', `${names.building(o)} ${sid(k)} (${names.recipe(o) || 'no recipe'}) is not connected to any belt or pipe`, o, { kv: save.buildings.details(o) }));
        continue;
      }
      for (const fluid of [false, true]) for (const dir of ['in', 'out'] as const) {
        const rates = dir === 'in' ? f.inp : f.out;
        const items = Object.keys(flows.pick(rates, fluid));
        if (!items.length || flows.connectedPort(k, fluid, dir)) continue;
        const rate = items.map(i => `${fmt(rates[i])}/min ${names.item(i)}`).join(', ');
        out.push(makeIssue(save, 'warn', 'build', dir === 'in' ? 'bp.openin' : 'bp.openout',
          `${names.building(o)} ${sid(k)}: ${fluid ? 'pipe' : 'belt'} ${dir === 'in' ? 'input' : 'output'} not connected inside the blueprint (${rate} ${dir === 'in' ? 'must come from' : 'must go'} outside)`, o,
          { kv: save.buildings.details(o), views: viewsFor(save, [k]) }));
      }
    }
    return out;
  },
};
