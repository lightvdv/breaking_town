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

  for (const g of c.groups) {
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
    if (t.scope === 'global' && (t.witness || t.cityEffect)) errors.push(`card ${t.id}: global news cannot have witnesses or city effects`);
    if (t.scope && t.scope !== 'local' && t.scope !== 'global') errors.push(`card ${t.id}: unknown scope ${t.scope}`);
    for (const g of t.audience ?? []) if (!c.groups.some((x) => x.id === g)) errors.push(`card ${t.id}: unknown audience ${g}`);
    if (t.source === 'rumor' && t.baseTruth === 0) errors.push(`card ${t.id}: rumors cannot be fully true`);
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
  if (b.minFinds < 1) errors.push('minFinds must be at least 1');
  if (!c.cards.some((t) => t.scope === 'global')) errors.push('no global news');
  return errors;
}
