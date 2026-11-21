// Circuits that run negative although they have generators: they cannot run on their own, and connected to the
// main grid they pull the difference from it.
import { fmt } from '../model/satisfactory_save';
import type { Analyzer, Issue } from './types';

export const POWER_BALANCE_ANALYZER: Analyzer = {
  id: 'power-balance',
  name: 'Circuit power balance',
  description: 'Flags switch circuits and separate grids that have generators but draw more than they make, now or at full load.',
  targets: ['save'],
  checks: {
    'power.deficit': { title: 'Group runs negative', why: 'This group has generators but draws more than they make. Alone it would shut down; on the main grid it pulls the difference from it.', fix: 'Add generation to the group, or move consumers out of it. Its generators are listed below.' },
    'power.deficitmax': { title: 'Negative at full load', why: 'This group is fine now, but at full load its consumers would draw more than its generators make.', fix: 'Add generation, or accept that it leans on the main grid at full load.' },
  },
  run(save) {
    const out: Issue[] = [];
    for (const c of save.circuits) {
      if (c.kind === 'main' || !c.genDeficit) continue;
      const p = c.power, d = p.gen - p.draw, dMax = p.maxGen - p.maxDraw;
      const now = d < -0.5, gens = `${p.gens} generator${p.gens > 1 ? 's' : ''}`;
      out.push({
        sev: now ? 'error' : 'warn', cat: 'power', code: now ? 'power.deficit' : 'power.deficitmax', card: c.key, subject: { kind: 'circuit', key: c.key }, at: c.pos,
        msg: now ? `Runs at ${fmt(d)} MW although it has ${gens} (${fmt(p.gen)} MW for ${fmt(p.draw)} MW drawn): it cannot run on its own, and on the main grid it pulls ${fmt(-d)} MW from it.`
          : `Goes negative at full load (${fmt(dMax)} MW) although it has ${gens}: it could not run on its own at full load.`,
      });
    }
    return out;
  },
};
