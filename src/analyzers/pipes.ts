// Pipe networks: flow reaches the consumers, one fluid per network, head lift within what extractors / pumps push.
import { fmt } from '../model/satisfactory_save';
import type { Analyzer, Issue } from './types';
import { flowCheckDocs, flowIssues, netIssue, networkTitle } from './network_flow';
import { networkView } from './issue';

/** Height (m) a producer or pump may push fluid above its outlet. */
export const HEAD_LIFT_M = 12;

export const PIPE_ANALYZER: Analyzer = {
  id: 'pipes',
  name: 'Pipe networks',
  description: 'Max-flow over every pipe network, mixed fluids, and head lift from each producer or pump to the consumers.',
  targets: ['save', 'blueprint'],
  checks: {
    ...flowCheckDocs('pipe'),
    'pipe.mix': { title: 'Mixed fluids', why: 'Two different fluids reach this pipe network. Pipes carry one fluid at a time: the second one blocks.', fix: 'Separate the networks, or flush the pipes and reconnect.' },
    'pipe.headlift': { title: 'Head lift exceeded', why: `Water extractors and pumps push fluid up to a limited height. On the way to the consumers this pipe climbs above the ${HEAD_LIFT_M} m rule from the highlighted producer.`, fix: 'Lower the pipe, or add a pipeline pump before the climb.' },
  },
  run(save) {
    const out: Issue[] = [];
    for (const n of save.networks.pipes) {
      const title = networkTitle(n);
      const fluids = n.items.map(s => s.item).filter(i => save.names.isFluid(i));
      if (n.items.length > 1 && fluids.length > 1) {
        const who = [...n.terminals].filter(t => fluids.some(i => n.supply.get(t)?.[i] || n.demand.get(t)?.[i]));
        out.push(netIssue(save, n, 'error', 'pipe.mix', `${title}: mixes fluids ${fluids.map(i => save.names.item(i)).join(' + ')}`, n.anchor, [networkView(n, who)]));
      }
      out.push(...flowIssues(save, n));
      const h = n.headLift;
      if (h && h.rise > HEAD_LIFT_M + 0.01) {
        out.push(netIssue(save, n, 'error', 'pipe.headlift', `${title}: head lift ${fmt(h.rise)} m exceeds ${HEAD_LIFT_M} m (${h.text})`, h.peak,
          [networkView(n, [h.base, h.peak.instanceName])], { kv: [['Head lift', `${fmt(h.rise)} m`], ['Limit', `${HEAD_LIFT_M} m`]] }));
      }
    }
    return out;
  },
};
