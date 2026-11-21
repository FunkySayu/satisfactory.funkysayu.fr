// Coal power plant rules: Mk.2 miners at 270 / 150 coal/min with a Mk.3 first belt, generators at 100% fed by a
// belt that traces back to a miner and by a water pipe, water extractors at 37.5% (1:1 / 6:6), all on the main grid.
import { cls, clockOf, fmt, isInName, leaf, num, purityName, ref, sid, tol, xyz, type SatisfactorySave, type SaveObject } from '../model/satisfactory_save';
import type { Analyzer, Issue } from './types';
import { makeIssue, viewsFor } from './issue';

export const COAL_RULES = {
  /** One extractor at 37.5% gives 45 m³/min: one generator. */
  extractorClock: 0.375,
  /** Miner Mk.2 clock per node purity multiplier: 270 coal/min on normal and pure nodes, 150 on impure ones (250% max). */
  minerClock: { 0.5: 2.5, 1: 2.25, 2: 1.125 } as Record<number, number>,
  firstBeltCap: 270,
};

export const COAL_PLANT_ANALYZER: Analyzer = {
  id: 'coal-plant',
  name: 'Coal power plants',
  description: 'Checks every coal generator, the miners on its belts and the water extractors on its pipes against the plant rules.',
  targets: ['save', 'blueprint'],
  checks: {
    'coal.noinput': { title: 'No conveyor input', why: 'This coal generator has no belt connected to its input.', fix: 'Connect it to the coal line.' },
    'coal.notrace': { title: 'Coal does not reach a miner', why: 'Walking the belts upstream from this generator never reaches a coal miner. An open (unconnected) input on the way is shown when there is one.', fix: 'Connect the open input, or link the line back to the miners.' },
    'coal.nowater': { title: 'No water pipe', why: 'This coal generator has no pipe connected.', fix: 'Connect it to the water network.' },
    'coal.clock': { title: 'Generator clock', why: 'Coal generators are expected at 100%.', fix: 'Set the clock to 100%.' },
    'coal.startup': { title: 'Generator starting up', why: 'Its productivity is below 100% but rising: just built, or belts and pipes still filling.', fix: 'Nothing to do; check again on a later save.' },
    'coal.prod': { title: 'Generator below 100%', why: 'The generator did not run all the time over the last ~5 minutes: it is short of coal or water.', fix: 'Look at its belt and pipe networks below for a red or orange part, or a head lift problem.' },
    'coal.minertype': { title: 'Miner type', why: 'The plant rule is Miner Mk.2.', fix: 'Replace the miner with a Mk.2.' },
    'coal.minerclock': { title: 'Miner clock', why: 'The plant rule: Normal 225%, Pure 112.5%, Impure 250% (270 or 150 coal/min).', fix: 'Set the miner clock to the rule for its node.' },
    'coal.nobelt': { title: 'Miner without belt', why: 'This coal miner has no output belt.', fix: 'Connect it to the generators.' },
    'coal.firstbelt': { title: 'First belt not Mk.3', why: 'The first belt out of the miner has to carry 270/min (Mk.3).', fix: 'Upgrade the highlighted first belt to Mk.3.' },
    'pipe.extclock': { title: 'Water extractor clock', why: 'The coal power plant rule is 37.5% per extractor (45 m³/min, one generator).', fix: 'Set the extractor to 37.5%, unless the network is balanced on purpose.' },
    'power.nowire': { title: 'No power wire', why: 'This building is not wired to any power pole.', fix: 'Wire it to the grid.' },
    'power.offgrid': { title: 'Not on the main grid', why: 'This building is wired, but its circuit does not reach the main grid even with every switch on.', fix: 'Connect its circuit to the main grid (or a switch on it).' },
  },
  run: checkCoalPlants,
};

function checkCoalPlants(save: SatisfactorySave): Issue[] {
  const BP = save.kind === 'blueprint';
  const { index: idx, logistics: lg, power, names } = save;
  const out: Issue[] = [];
  /** Issue about building o: its details and the diagrams of the networks it (and also) sit on. */
  const add = (o: SaveObject, i: Issue, also: string[] = []) => {
    i.subject = { kind: 'building', name: o.instanceName };
    i.views ??= viewsFor(save, [o.instanceName, ...also]); i.kv ??= save.buildings.details(o); out.push(i);
  };
  const issue = (sev: Issue['sev'], cat: Issue['cat'], code: string, msg: string, anchor: SaveObject) => makeIssue(save, sev, cat, code, msg, anchor);
  // walk belts upstream: is there a miner, and which parts have an open input
  const upstream = (g: SaveObject) => {
    const seen = new Set<string>(); const st = [g.instanceName]; let miner = false; const open: SaveObject[] = [];
    while (st.length) {
      const x = st.pop()!; const o = idx.at(x);
      for (const p of (lg.beltPorts.get(x) || []).filter(p => isInName(p.name))) if (!p.to) open.push(o);
      for (const u of lg.bIn.get(x) || []) {
        if (seen.has(u)) continue; seen.add(u); const uo = idx.at(u);
        if (/^Build_Miner/.test(cls(uo))) { miner = true; continue; }
        if (lg.isBeltTransport(uo)) st.push(u);
      }
    }
    return { miner, open };
  };
  const powerCheck = (o: SaveObject, what: string) => {
    if (BP) return; // blueprints: see the blueprint power check
    if (!power.wired.has(o.instanceName)) add(o, issue('error', 'power', 'power.nowire', `${what} ${sid(o.instanceName)} has no power wire`, o));
    else if (!power.onMainGrid(o.instanceName)) add(o, issue('error', 'power', 'power.offgrid', `${what} ${sid(o.instanceName)} is not connected to the main grid`, o));
  };
  const minersChecked = new Set<string>(), pumpsChecked = new Set<string>(), netsChecked = new Set<number>();
  for (const g of idx.ofClass('Build_GeneratorCoal_C')) {
    const pr = (k1: string, k2: string) => num(g, k1, 0) / (num(g, k2, 0) || 1);
    const last = pr('mLastProductivityMeasurementProduceDuration', 'mLastProductivityMeasurementDuration');
    const cur = pr('mCurrentProductivityMeasurementProduceDuration', 'mCurrentProductivityMeasurementDuration');
    const dur = num(g, 'mLastProductivityMeasurementDuration', 0);
    const gid = sid(g.instanceName);
    const beltIn = (lg.beltPorts.get(g.instanceName) || []).find(p => isInName(p.name));
    if (!beltIn?.to) { if (!BP) add(g, issue('error', 'coal', 'coal.noinput', `Coal gen ${gid} has no conveyor input`, g)); }
    else if (!BP) {
      const tr = upstream(g);
      if (!tr.miner) add(g, issue('error', 'coal', 'coal.notrace', `Coal gen ${gid} conveyor does not trace back to a miner${tr.open.length ? `; open input on ${names.building(tr.open[0])} at (${xyz(tr.open[0]).join(', ')})` : ''}`, tr.open[0] ?? g), tr.open.map(o => o.instanceName));
    }
    if (!BP && !(lg.pipePorts.get(g.instanceName) || []).some(p => p.to)) add(g, issue('error', 'coal', 'coal.nowater', `Coal gen ${gid} has no water pipe`, g));
    const clk = clockOf(g);
    if (Math.abs(clk - 1) > 1e-3) add(g, issue('warn', 'coal', 'coal.clock', `Coal gen ${gid} clocked at ${fmt(clk * 100)}%`, g));
    if (!BP && (last < 0.99 || cur < 0.99)) {
      if (dur === 0 || cur > last) add(g, issue('info', 'coal', 'coal.startup', `Coal gen ${gid} still starting up (last ${fmt(last * 100)}%, current ${fmt(cur * 100)}%)`, g));
      else add(g, issue(last < 0.99 ? 'error' : 'warn', 'coal', 'coal.prod', `Coal gen ${gid} at ${fmt(Math.min(last, cur) * 100)}% productivity (last ${fmt(last * 100)}%, current ${fmt(cur * 100)}%)`, g));
    }
    powerCheck(g, 'Coal gen');
    // miners feeding this generator
    for (const n of save.networks.of(g.instanceName).filter(x => x.kind === 'belt')) for (const m of n.sources) {
      if (!/^Build_Miner/.test(cls(m)) || minersChecked.has(m.instanceName)) continue; minersChecked.add(m.instanceName);
      const node = save.gameData.nodes[leaf(ref(m, 'mExtractableResource') || '')]; if (!node || node[0] !== 'Desc_Coal_C') continue;
      const mid = sid(m.instanceName), mclk = clockOf(m);
      if (cls(m) !== 'Build_MinerMk2_C') add(m, issue('warn', 'coal', 'coal.minertype', `Coal miner ${mid} is ${names.building(m)} (rule: Miner Mk.2)`, m));
      const want = COAL_RULES.minerClock[node[1]];
      if (cls(m) === 'Build_MinerMk2_C' && Math.abs(mclk - want) > 1e-3) add(m, issue('warn', 'coal', 'coal.minerclock', `Coal miner ${mid} (${purityName(node[1])}) clocked ${fmt(mclk * 100)}%, rule ${fmt(want * 100)}%`, m));
      const firstB = [...(lg.bOut.get(m.instanceName) || [])].map(x => idx.at(x))[0];
      if (!firstB) add(m, issue('error', 'coal', 'coal.nobelt', `Coal miner ${mid} has no output belt`, m));
      else if (lg.beltCap(firstB) !== COAL_RULES.firstBeltCap) add(m, issue('warn', 'coal', 'coal.firstbelt', `Coal miner ${mid}: first belt is ${names.building(firstB)} (rule: Mk.3)`, firstB), [firstB.instanceName]);
      powerCheck(m, 'Coal miner');
    }
    // water network: off-rule extractor clocks are often intentional, only a warning when the network is out of balance
    for (const n of save.networks.of(g.instanceName).filter(x => x.kind === 'pipe')) {
      if (netsChecked.has(n.index)) continue; netsChecked.add(n.index);
      const water = n.summary.items.find(i => i.item === names.item('Desc_Water_C'));
      const balanced = !!water && water.demand !== null && Math.abs(water.supply - water.demand) <= tol(water.demand);
      for (const p of [...n.terminals].map(t => idx.at(t)).filter(o => !o.virtual && cls(o) === 'Build_WaterPump_C')) {
        if (pumpsChecked.has(p.instanceName)) continue; pumpsChecked.add(p.instanceName);
        const c = clockOf(p);
        if (Math.abs(c - COAL_RULES.extractorClock) > 1e-4) add(p, issue(balanced ? 'info' : 'warn', 'pipe', 'pipe.extclock', `Water extractor ${sid(p.instanceName)} clocked ${fmt(c * 100)}% (rule 37.5%)${balanced ? ', network supply matches demand' : ''}`, p));
        powerCheck(p, 'Water extractor');
      }
    }
  }
  return out;
}
