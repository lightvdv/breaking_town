import { lotsNeeded } from './map';
import type { Content } from './types';

/** Returns a list of problems in the content files; empty when everything is consistent. */
export function validateContent(c: Content): string[] {
  const errors: string[] = [];
  const channelIds = new Set(c.channels.map((x) => x.id));
  const upgradeIds = new Set(c.upgrades.map((x) => x.id));
  const buildingTypes = new Set(c.buildings.map((x) => x.type));

  const unique = (kind: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) errors.push(`duplicate ${kind} id: ${id}`);
      seen.add(id);
    }
  };
  unique('group', c.groups.map((x) => x.id));
  unique('channel', c.channels.map((x) => x.id));
  unique('upgrade', c.upgrades.map((x) => x.id));
  unique('card', c.cards.map((x) => x.id));

  const shares = c.groups.reduce((s, g) => s + g.share, 0);
  if (Math.abs(shares - 1) > 0.01) errors.push(`group shares sum to ${shares}, expected 1`);
  if (!c.channels.some((ch) => ch.cost === 0 && ch.requires === null)) errors.push('no free starting channel');
  const lots = c.balance.mapBlocks * c.balance.mapBlocks;
  if (lotsNeeded(c) > lots) errors.push(`buildings need ${lotsNeeded(c)} lots, the map has ${lots}`);
  for (const b of c.buildings) if (b.size !== 1 && b.size !== 2) errors.push(`building ${b.type}: size must be 1 or 2`);
  if (c.balance.smallPerLot < 1 || c.balance.smallPerLot > 4) errors.push('smallPerLot must be 1..4');

  const formKeys = ['one', 'oneAcc', 'oneDat', 'oneIns', 'many', 'manyGen', 'manyDat', 'manyIns'];
  for (const g of c.groups) {
    for (const k of formKeys) if (!(g.forms as unknown as Record<string, string> | undefined)?.[k]) errors.push(`group ${g.id}: missing word form ${k}`);
    for (const ch of Object.keys(g.channels)) if (!channelIds.has(ch)) errors.push(`group ${g.id}: unknown channel ${ch}`);
    for (const j of g.jobs) if (!buildingTypes.has(j)) errors.push(`group ${g.id}: unknown job building ${j}`);
  }
  const checkReq = (owner: string, req: { channel?: string; upgrade?: string } | null) => {
    if (req?.channel && !channelIds.has(req.channel)) errors.push(`${owner}: unknown required channel ${req.channel}`);
    if (req?.upgrade && !upgradeIds.has(req.upgrade)) errors.push(`${owner}: unknown required upgrade ${req.upgrade}`);
  };
  for (const ch of c.channels) checkReq(`channel ${ch.id}`, ch.requires);
  for (const u of c.upgrades) {
    checkReq(`upgrade ${u.id}`, u.requires);
    if (u.effects.channel && !channelIds.has(u.effects.channel)) errors.push(`upgrade ${u.id}: unknown channel`);
  }

  for (const t of c.cards) {
    for (let level = 0; level < 3; level++) {
      const possible = level >= t.baseTruth;
      if (possible !== (t.titles[level] !== null)) {
        errors.push(`card ${t.id}: title for truth level ${level} should be ${possible ? 'set' : 'null'}`);
      }
      const e = t.effects[level];
      if (!possible && e !== null) errors.push(`card ${t.id}: effect for impossible truth level ${level}`);
      if (e && ['quitJob', 'avoid'].includes(e.type) && !e.building) {
        errors.push(`card ${t.id}: effect ${e.type} needs a building`);
      }
      if (e?.building && !buildingTypes.has(e.building)) errors.push(`card ${t.id}: unknown building ${e.building}`);
    }
    if (t.source === 'event' && t.baseTruth !== 0) errors.push(`card ${t.id}: events must be true`);
    if (t.source === 'fact' && t.baseTruth !== 0) errors.push(`card ${t.id}: facts must be true`);
    if (t.source === 'fact' && t.cityEffect) errors.push(`card ${t.id}: facts do not change the city (use an event)`);
    if (!['event', 'fact', 'rumor', 'investigation'].includes(t.source)) errors.push(`card ${t.id}: unknown source ${t.source}`);
    if (t.scope === 'global' && (t.witness || t.cityEffect)) errors.push(`card ${t.id}: global news cannot have witnesses or city effects`);
    if (t.scope && t.scope !== 'local' && t.scope !== 'global') errors.push(`card ${t.id}: unknown scope ${t.scope}`);
    for (const g of t.audience ?? []) if (!c.groups.some((x) => x.id === g)) errors.push(`card ${t.id}: unknown audience ${g}`);
    const stigma = t.effects.some((e) => e?.type === 'stigma');
    if (t.source === 'investigation' && (!t.target || !c.groups.some((g) => g.id === t.target))) {
      errors.push(`card ${t.id}: investigation needs a valid target group`);
    }
    if (stigma && !t.target) errors.push(`card ${t.id}: stigma effect needs a target group`);
    if (t.source === 'rumor' && t.baseTruth === 0) errors.push(`card ${t.id}: rumors cannot be fully true`);
    // Reporters bring only truth or half-truth; outright lies are the player's doing.
    if (t.baseTruth > 1) errors.push(`card ${t.id}: reporters never bring outright lies (baseTruth must be 0 or 1)`);
    // Conflict stories between two groups (CONCEPT.md §5.5).
    const placeholders = [...t.titles, t.calmTitle].some((x) => x && /\{[ab]\.\w+\}/.test(x));
    if (t.conflict) {
      if (!t.calmTitle) errors.push(`card ${t.id}: conflict story needs a calmTitle`);
      if (t.conflict !== 'any') {
        const [a, z] = t.conflict;
        if (a === z || !c.groups.some((g) => g.id === a) || !c.groups.some((g) => g.id === z)) errors.push(`card ${t.id}: conflict needs two different known groups`);
      }
      if (t.source === 'event' && (!t.place || !buildingTypes.has(t.place))) errors.push(`card ${t.id}: incident needs a known place building`);
      if (t.source === 'investigation' || t.scope === 'global') errors.push(`card ${t.id}: conflict stories are local events, facts or rumors`);
    } else if (placeholders || t.calmTitle) errors.push(`card ${t.id}: group placeholders and calmTitle only in conflict stories`);
    for (const text of [...t.titles, t.calmTitle]) {
      for (const m of (text ?? '').matchAll(/\{([ab])\.(\w+)\}/g)) if (!formKeys.includes(m[2])) errors.push(`card ${t.id}: unknown word form ${m[2]}`);
    }
  }
  unique('reporter', c.reporters.map((x) => x.id));
  const topics = new Set(c.cards.map((t) => t.topic));
  for (const r of c.reporters) {
    const s = r.skills;
    if (s.luck <= 0 || s.luck > 1) errors.push(`reporter ${r.id}: luck must be in (0, 1]`);
    if (s.nose < 0 || s.nose > 3) errors.push(`reporter ${r.id}: nose must be 0..3`);
    if (!['local', 'global', 'any'].includes(s.scope)) errors.push(`reporter ${r.id}: unknown scope ${s.scope}`);
    for (const t of s.topics) if (!topics.has(t)) errors.push(`reporter ${r.id}: unknown topic ${t}`);
  }
  const b = c.balance;
  for (const id of b.startReporters) if (!c.reporters.some((r) => r.id === id)) errors.push(`unknown start reporter ${id}`);
  if (b.startReporters.length < 1) errors.push('at least one start reporter is needed');
  if (b.startReporters.length > b.maxReporters) errors.push('more start reporters than maxReporters');
  if (b.maxReporters > c.reporters.length) errors.push('maxReporters exceeds the number of reporters');
  if (b.agencyFee < 0 || b.agencyMaxOffer < 1) errors.push('agencyFee must be ≥ 0 and agencyMaxOffer ≥ 1');
  for (const r of c.reporters) if (!(r.weight >= 0)) errors.push(`reporter ${r.id}: weight must be ≥ 0`);
  if (b.minFinds < 1) errors.push('minFinds must be at least 1');
  if (!c.cards.some((t) => t.scope === 'global')) errors.push('no global news');
  // Enough stories of each kind that the no-repeat rule can hold (CONCEPT.md §3.3).
  for (const scope of ['local', 'global'] as const) {
    for (const kind of ['true', 'rumor'] as const) {
      const n = c.cards.filter(
        (t) => (t.scope ?? 'local') === scope && (kind === 'rumor' ? t.source === 'rumor' : t.source === 'fact' || t.source === 'event'),
      ).length;
      if (n < 8) errors.push(`only ${n} ${scope} ${kind} stories, need at least 8`);
    }
  }
  for (const g of c.groups) {
    if (!c.cards.some((t) => t.source === 'investigation' && t.target === g.id)) errors.push(`no investigation story about ${g.id}`);
  }
  for (const key of Object.keys(b.tensionStart)) {
    const [x, y] = key.split('|');
    const ix = c.groups.findIndex((g) => g.id === x);
    const iy = c.groups.findIndex((g) => g.id === y);
    if (ix < 0 || iy < 0 || ix >= iy) errors.push(`tensionStart: bad pair key ${key} (two groups in content order)`);
  }
  return errors;
}
