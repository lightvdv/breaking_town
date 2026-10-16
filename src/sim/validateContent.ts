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
    if (t.source === 'rumor' && t.baseTruth === 0) errors.push(`card ${t.id}: rumors cannot be fully true`);
  }
  return errors;
}
