// Blueprints: every powered machine on one power network, so one connection powers it all.
import { sid, type SaveObject } from '../model/satisfactory_save';
import type { Analyzer, Issue } from './types';
import { makeIssue } from './issue';

export const BLUEPRINT_POWER_ANALYZER: Analyzer = {
  id: 'blueprint-power',
  name: 'Blueprint power network',
  description: 'Every powered machine of a blueprint is wired, and all of them are on one power network.',
  targets: ['blueprint'],
  checks: {
    'bp.nowire': { title: 'No power wire', why: 'This machine is not wired to any power pole or other machine in the blueprint.', fix: "Wire it to the blueprint's power network." },
    'bp.powersplit': { title: 'Separate power network', why: 'All machines of a blueprint should be on one power network, so one connection powers it all. These machines are wired to each other but not to the rest.', fix: 'Add a wire between the two networks.' },
  },
  run(save) {
    const bp = save.blueprint; if (!bp) return [];
    const name = (b: SaveObject) => `${save.names.building(b)} ${sid(b.instanceName)}`;
    const out: Issue[] = bp.unwired.map(b => makeIssue(save, 'error', 'power', 'bp.nowire', `${name(b)} has no power wire`, b, { kv: save.buildings.details(b) }));
    const [main, ...rest] = bp.powerGroups;
    for (const c of rest) {
      out.push(makeIssue(save, 'error', 'power', 'bp.powersplit',
        `${c.length} machine${c.length > 1 ? 's are' : ' is'} on a separate power network from the other ${main.length} (e.g. ${name(c[0])})`, c[0],
        { kv: [['Machines', c.map(name).slice(0, 12).join(', ') + (c.length > 12 ? ` +${c.length - 12}` : '')], ['Main network', `${main.length} machines`]] }));
    }
    return out;
  },
};
