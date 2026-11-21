// Flow checks shared by the belt and pipe analyzers: they read the solver's results on one network.
import { fmt, tol, xyz, type Network, type SatisfactorySave } from '../model/satisfactory_save';
import { makeIssue, networkView, plural, where } from './issue';
import type { CheckDoc, Issue, Severity, View } from './types';

/** A small surplus is usually intentional headroom: below this share it is only a note. */
export const SURPLUS_WARN = 0.5;

export const networkTitle = (n: Network) => `${n.kind === 'belt' ? 'Belt' : 'Pipe'} network (${n.label})`;

/** Issue on a network (its subject), pointing at a building. */
export function netIssue(save: SatisfactorySave, n: Network, sev: Severity, code: string, msg: string, anchor = n.anchor, views?: View[], more: Partial<Issue> = {}) {
  return makeIssue(save, sev, code.startsWith('belt.') ? 'belt' : 'pipe', code, msg, anchor, { subject: { kind: 'network', index: n.index }, views, ...more });
}

export function flowIssues(save: SatisfactorySave, n: Network): Issue[] {
  const out: Issue[] = [];
  const k = n.kind, title = networkTitle(n), idx = save.index;
  const item = (i: string) => save.names.item(i);
  const at = (name: string) => where(save, idx.at(name));
  const cap = (name: string) => { const o = idx.at(name); return k === 'belt' ? save.logistics.beltCap(o)! : save.logistics.pipeCap(o)!; };
  const cutTxt = (cut: string[]) => `${cut.slice(0, 4).map(c => `${save.names.building(idx.at(c))} (cap ${fmt(cap(c))}) at (${xyz(idx.at(c)).join(', ')})`).join('; ')}${cut.length > 4 ? ` +${cut.length - 4} more` : ''}`;
  const sum = (l: [string, number][]) => fmt(l.reduce((a, x) => a + x[1], 0));
  const keys = (l: [string, number][]) => l.map(x => x[0]);
  const view = (names: string[], parts: string[] = []) => [networkView(n, names, parts)];
  const bIns = n.boundaryInputs.length > 0;
  for (const s of n.items) {
    const name = item(s.item);
    if (s.short) {
      const { flow, cut, unmet } = s.short;
      if (cut.length) {
        out.push(netIssue(save, n, 'error', `${k}.bottleneck`, `${title}: only ${fmt(flow)}/min of ${name} reaches consumers${bIns ? ' (machines inside plus the blueprint inputs)' : ''}, ${fmt(s.target)}/min needed. Bottleneck: ${cutTxt(cut)}.`,
          idx.at(cut[0]), view([], cut)));
      } else if (unmet.length) {
        out.push(netIssue(save, n, 'error', `${k}.unreached`, `${title}: ${unmet.length} consumer${plural(unmet.length)} miss ${sum(unmet)}/min of ${name} although it is ${bIns ? 'available' : 'produced'}: the routing does not reach them (e.g. ${at(unmet[0][0])}).`,
          idx.at(unmet[0][0]), view(keys(unmet))));
      }
    }
    if (n.external) continue; // unknown I/O (station, storage, unresolved recipe): no balance / flow verdicts
    if (s.backup) {
      const { cut, unused } = s.backup; const p0 = unused[0]?.[0] ?? s.producers[0][0];
      out.push(netIssue(save, n, 'warn', `${k}.backup`, `${title}: ${fmt(s.supply - s.toConsumers - s.toSinks)}/min of ${name} backs up (consumers and sinks reachable from ${unused.length} producer${plural(unused.length)} take less, e.g. ${at(p0)})${cut.length ? `. Bottleneck: ${cutTxt(cut)}` : ''}.`,
        cut.length ? idx.at(cut[0]) : idx.at(p0), view(keys(unused), cut)));
    }
    if (!n.unlimited && s.supply > s.demand + tol(s.demand)) {
      if (s.demand === 0) {
        out.push(netIssue(save, n, 'warn', `${k}.nosink`, `${title}: ${fmt(s.supply)}/min of ${name} has no consumer (line ends ${n.sinks.length ? 'at idle machines' : 'at an open end'}).`, n.anchor, view(keys(s.producers))));
      } else {
        const over = (s.supply - s.demand) / s.demand;
        out.push(netIssue(save, n, over < SURPLUS_WARN ? 'info' : 'warn', `${k}.surplus`, `${title}: surplus of ${name}: produces ${fmt(s.supply)}/min, consumers take ${fmt(s.demand)}/min (+${fmt(over * 100)}%, backs up).`, n.anchor, [{ g: n.index }]));
      }
    } else if (s.supply < s.demand - tol(s.demand) && !bIns) {
      if (s.supply === 0) {
        const c0 = s.consumers[0] && idx.at(s.consumers[0][0]);
        out.push(netIssue(save, n, 'error', `${k}.noproducer`, `${title}: input line has no producer: ${s.consumers.length} consumer${plural(s.consumers.length)} need ${fmt(s.demand)}/min of ${name} (unconnected belt start?)`, c0 ?? n.anchor, view(keys(s.consumers))));
      } else {
        out.push(netIssue(save, n, 'error', `${k}.deficit`, `${title}: deficit of ${name}: consumers need ${fmt(s.demand)}/min, only ${fmt(s.supply)}/min produced.`, n.anchor, [{ g: n.index }]));
      }
    }
    if (s.overloaded.length) {
      const o = s.overloaded[0]; const ob = idx.at(o.part);
      out.push(netIssue(save, n, 'warn', 'belt.overload', `${title}: ${s.overloaded.length} belt${plural(s.overloaded.length)} may be overloaded, e.g. ${save.names.building(ob)} must carry up to ${fmt(o.need)}/min of ${name} (cap ${o.cap}, ${fmt(o.need - o.cap)} over).`,
        ob, view([], s.overloaded.map(x => x.part))));
    }
  }
  return out;
}

/** Docs of the flow checks, for belts or pipes. */
export function flowCheckDocs(k: 'belt' | 'pipe'): Record<string, CheckDoc> {
  const part = k === 'belt' ? 'belts and lifts' : 'pipes', one = k === 'belt' ? 'belt' : 'pipe';
  return {
    [`${k}.bottleneck`]: { title: `${k === 'belt' ? 'Belt' : 'Pipe'} bottleneck`, why: `The consumers need more than the narrowest ${part} on the way can carry. The red ${part} in the diagram are that narrowest cut: the solver cannot push more through them.`, fix: `Upgrade the red ${part} to a higher tier, or run a second ${one} around them. Edge labels read flow / capacity per minute.` },
    [`${k}.unreached`]: { title: 'Consumers not reached', why: `Enough is ${k === 'belt' ? 'produced' : 'available'}, but no route through the ${part} leads to the highlighted machines: a splitter output not connected, a merger facing the wrong way, or a missing ${one}.`, fix: 'Follow the highlighted machines (red outline = short of input) back to the producers and connect the missing link.' },
    [`${k}.backup`]: { title: 'Output backs up', why: 'The producers make more than the consumers and sinks they can reach take. The rest stays on the line, so the producers slow down.', fix: 'Add a consumer or an overflow to a sink, or clock the highlighted producers down. Orange outline = producer that cannot send all it makes.' },
    [`${k}.surplus`]: { title: 'Surplus', why: 'The producers make more than the consumers on this line need. The line fills up, then the producers run below 100%. A small surplus is often intended headroom (shown as a note).', fix: 'Clock the producers down, add a consumer, or send the overflow to a sink.' },
    [`${k}.nosink`]: { title: 'No consumer', why: `Items are produced on this ${one}, but nothing on it uses them: the line ends at idle machines or an open end.`, fix: 'Connect the line to the machines that need it, or to a sink / storage.' },
    [`${k}.deficit`]: { title: 'Not enough produced', why: 'The consumers on this line need more than its producers make, even with perfect routing.', fix: 'Add or overclock producers, or bring more in from elsewhere.' },
    [`${k}.noproducer`]: { title: 'Input line has no producer', why: `The highlighted consumers wait for items on this ${one}, but nothing feeds it. Often an unconnected ${one} start.`, fix: `Connect the start of the ${one} to a producer, a station or storage.` },
  };
}
