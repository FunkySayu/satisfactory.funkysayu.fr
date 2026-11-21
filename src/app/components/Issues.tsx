// Lists of issues and networks that open the details modal.
import type { CheckDoc, Issue, NetGraph, NetSummary } from '../../report/types';
import { coords, num } from '../lib/format';
import { setState } from '../store';
import { ChevronIcon, OkIcon, SevIcon } from './icons';
import { useTip } from './Tooltip';
import { Coords, Count } from './ui';

export interface IssueContext { graphs: NetGraph[]; checks: Record<string, CheckDoc>; plain: boolean; label?: string }
export const openIssues = (ctx: IssueContext, issues: Issue[], idx = 0) => setState({ modal: { ...ctx, issues, idx } });
export const openNetwork = (ctx: IssueContext, net: number) => setState({ modal: { ...ctx, net, idx: 0 } });

export const CategoryTag = ({ cat }: { cat: string }) =>
  <span className="font-head font-semibold text-[10.5px]/[1.6] uppercase tracking-[.08em] px-1.5 rounded-[3px] bg-panel-2 text-muted mt-px max-sm:hidden">{cat}</span>;

export function IssueLink({ onClick, done, children }: { onClick: () => void; done?: boolean; children: React.ReactNode }) {
  return <button type="button" onClick={onClick}
    className={`link [overflow-wrap:anywhere] hover:decoration-muted ${done ? 'line-through text-faint' : 'text-inherit'}`}>{children}</button>;
}

/** Issues of one card / blueprint. */
export function ChecksList({ issues, ctx }: { issues: Issue[]; ctx: IssueContext }) {
  if (!issues.length) return <p className="m-0 p-2 text-faint text-sm flex gap-2 items-center"><OkIcon /> All checks pass.</p>;
  return (
    <ul className="list-none m-0 py-1">{issues.map((i, k) => (
      <li key={i.uid ?? k} className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] max-sm:grid-cols-[auto_minmax(0,1fr)] gap-2 items-start py-[7px] border-t border-line first:border-t-0">
        <SevIcon sev={i.sev} className="mt-0.5" /><CategoryTag cat={i.cat} />
        <IssueLink onClick={() => openIssues(ctx, issues, k)}>{i.msg}</IssueLink>
        {i.at ? <span className="max-sm:col-start-2 max-sm:justify-self-start"><Coords at={i.at} /></span> : <span />}
      </li>))}
    </ul>
  );
}

function NetRow({ n, ctx }: { n: NetSummary; ctx: IssueContext }) {
  const tip = useTip('Open the network diagram');
  return (
    <tr tabIndex={0} className="cursor-pointer hover:[&>td]:bg-panel-2" onClick={() => openNetwork(ctx, n.g)} {...tip}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNetwork(ctx, n.g); } }}>
      <td><SevIcon sev={n.sev} /></td>
      <td>{n.label}{n.extra && <div className="sub">{n.extra}</div>}</td>
      <td className="numc">{n.items.map((i, k) => <div key={k}>{num(i.supply)}{i.ext ? ` +${num(i.ext)} in` : ''} → {i.demand === null ? '∞' : num(i.demand)}</div>)}</td>
      <td className="numc">{n.items.map((i, k) => <div key={k}>{num(i.flow)}</div>)}</td>
      <td className="numc">{n.parts}</td><td className="numc">{coords(n.at)}</td>
    </tr>
  );
}

/** Collapsible table of the belt or pipe networks of a card. */
export function NetTable({ list, kind, ctx }: { list: NetSummary[]; kind: 'Belt' | 'Pipe'; ctx: IssueContext }) {
  if (!list.length) return null;
  const bad = list.filter(n => n.sev !== 'ok').length;
  return (
    <details className="group/nets">
      <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
        <h4 className="mt-2.5 font-head font-semibold text-[15px] flex gap-2 items-center"><ChevronIcon className="group-open/nets:rotate-90" />{kind} networks <Count>{list.length}{bad ? ` · ${bad} with issues` : ''}</Count></h4>
      </summary>
      <div className="tbl mt-2"><table>
        <thead><tr><th /><th>Carries</th><th className="numc">Supply → demand /min</th><th className="numc">Flow</th><th className="numc">Parts</th><th className="numc">At (m)</th></tr></thead>
        <tbody>{list.map(n => <NetRow key={n.g} n={n} ctx={ctx} />)}</tbody>
      </table></div>
    </details>
  );
}
