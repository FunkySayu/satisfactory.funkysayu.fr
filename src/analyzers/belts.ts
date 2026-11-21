// Belt networks: supply meets demand, every belt carries its load, no open belt end receives items.
import type { Analyzer, Issue } from './types';
import { flowCheckDocs, flowIssues, netIssue, networkTitle } from './network_flow';
import { plural } from './issue';

export const BELT_ANALYZER: Analyzer = {
  id: 'belts',
  name: 'Belt networks',
  description: 'Max-flow over every belt network: bottlenecks, unreached consumers, surplus and deficits, overloaded belts, open belt ends.',
  targets: ['save', 'blueprint'],
  checks: {
    ...flowCheckDocs('belt'),
    'belt.overload': { title: 'Belt may be overloaded', why: 'Both what can arrive upstream and what is wanted downstream exceed the capacity of the orange belts. Depending on how the splitters share items, they may cap the flow.', fix: 'Upgrade the orange belts, or check that the splitters upstream send less through them.' },
    'belt.openend': { title: 'Open belt end', why: 'A belt on this line ends without a connection. Items reaching it pile up there.', fix: 'Connect the open end (dashed box) or remove the extra belt.' },
  },
  run(save) {
    const out: Issue[] = [];
    for (const n of save.networks.belts) {
      out.push(...flowIssues(save, n));
      if (n.openEnds.length) {
        const ends = n.graph.nodes.map((x, i) => x.t === 'end' ? i : -1).filter(i => i >= 0);
        out.push(netIssue(save, n, 'warn', 'belt.openend', `${networkTitle(n)}: ${n.openEnds.length} belt end${plural(n.openEnds.length)} not connected (items pile up)`, n.openEnds[0], [{ g: n.index, n: ends }]));
      }
    }
    return out;
  },
};
