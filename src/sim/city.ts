import { chance, int, next, pick, weightedPick, type RngState } from './rng';
import { buildingDefOf, clamp, groupOf } from './lookup';
import type {
  Building,
  BuildingType,
  CityEffect,
  CityMetrics,
  Content,
  GameState,
  GroupDef,
  Resident,
} from './types';

export function newResident(c: Content, rng: RngState, id: number, group: GroupDef, home: number): Resident {
  const trust = clamp(c.balance.startTrust + (next(rng) - 0.5) * 20, 0, 100);
  return {
    id,
    group: group.id,
    home,
    job: null,
    money: 20 + next(rng) * 20,
    mood: 0.55 + next(rng) * 0.25,
    outlook: c.balance.moodBaseline,
    status: 'active',
    trust,
    beliefs: [],
    protestTurns: 0,
    avoid: {},
    quitFrom: [],
  };
}

export function createResidents(c: Content, rng: RngState, buildings: Building[]): Resident[] {
  const homes = buildings.filter((b) => b.type === 'home');
  const out: Resident[] = [];
  for (const g of c.groups) {
    const count = Math.round(g.share * c.balance.population);
    for (let i = 0; i < count; i++) {
      out.push(newResident(c, rng, out.length, g, homes[out.length % homes.length].id));
    }
  }
  return out;
}

export function countWorkers(residents: Resident[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of residents) {
    if (r.status === 'active' && r.job !== null) m.set(r.job, (m.get(r.job) ?? 0) + 1);
  }
  return m;
}

export function tryAssignJob(
  r: Resident,
  group: GroupDef,
  buildings: Building[],
  workers: Map<number, number>,
): boolean {
  for (const type of group.jobs) {
    if (r.quitFrom.includes(type)) continue;
    const b = buildings.find((x) => x.type === type && x.open && (workers.get(x.id) ?? 0) < x.jobs);
    if (b) {
      r.job = b.id;
      workers.set(b.id, (workers.get(b.id) ?? 0) + 1);
      return true;
    }
  }
  return false;
}

export function leaveCity(r: Resident): void {
  r.status = 'left';
  r.job = null;
  r.protestTurns = 0;
}

export function computeMetrics(state: GameState, c: Content): CityMetrics {
  const b = c.balance;
  const active = state.residents.filter((r) => r.status === 'active');
  const n = active.length;
  const employed = active.filter((r) => r.job !== null).length;
  const shopTurnover = state.buildings
    .filter((x) => x.type === 'shop')
    .reduce((s, x) => s + x.turnover, 0);

  const population = clamp(n / state.initialPopulation);
  // Relative to the starting workforce, so people leaving the city does not look like full employment.
  const employment = clamp(employed / Math.max(1, state.initialEmployed));
  const economy = clamp(shopTurnover / (state.initialPopulation * b.shopPrice));
  const mood = n ? active.reduce((s, r) => s + r.mood, 0) / n : 0;
  const order = n ? 1 - active.filter((r) => r.protestTurns > 0).length / n : 0;
  const w = b.cityIndexWeights;
  const cityIndex =
    100 *
    (w.population * population +
      w.employment * employment +
      w.economy * economy +
      w.mood * mood +
      w.order * order);
  return { population, employment, economy, mood, order, cityIndex, activeResidents: n };
}

function layOffOne(state: GameState, rng: RngState, building: Building): boolean {
  const staff = state.residents.filter((r) => r.status === 'active' && r.job === building.id);
  if (staff.length === 0) return false;
  pick(rng, staff).job = null;
  return true;
}

export function applyCityEffect(state: GameState, rng: RngState, e: CityEffect): void {
  const active = state.residents.filter((r) => r.status === 'active');
  switch (e.type) {
    case 'mood':
      for (const r of active) {
        if (e.building && (r.job === null || state.buildings[r.job].type !== e.building)) continue;
        r.mood = clamp(r.mood + e.amount);
      }
      break;
    case 'money':
      for (const r of active) r.money = Math.max(0, r.money + e.amount);
      break;
    case 'layoff': {
      const targets = state.buildings.filter((x) => x.type === e.building && x.open);
      for (let i = 0; i < e.amount && targets.length; i++) layOffOne(state, rng, pick(rng, targets));
      break;
    }
  }
}

/** One day of city life: work, shopping, fun, businesses, hiring, growth and the mayor's defense. */
export function advanceCity(state: GameState, c: Content, rng: RngState): string[] {
  const b = c.balance;
  const notes: string[] = [];
  for (const x of state.buildings) x.turnover = 0;
  const shops = state.buildings.filter((x) => x.type === 'shop');
  const funs = state.buildings.filter((x) => x.type === 'entertainment');
  const openShops = shops.filter((x) => x.open);
  const openFuns = funs.filter((x) => x.open);

  for (const r of state.residents) {
    if (r.status !== 'active') continue;
    const g = groupOf(c, r.group);
    if (r.protestTurns > 0) r.protestTurns--;

    if (r.job !== null) r.money += b.wage;
    else if (g.jobs.length > 0) {
      r.money += b.benefit;
      r.mood += b.moodUnemployed;
    } else r.money += g.pension;

    if (!r.avoid.shop && openShops.length && r.money >= b.shopPrice) {
      pick(rng, openShops).turnover += b.shopPrice;
      r.money -= b.shopPrice;
      r.mood += b.moodShop;
    } else r.mood += b.moodNoShop;

    if (!r.avoid.entertainment && openFuns.length && r.money >= b.funPrice && chance(rng, b.funChance)) {
      pick(rng, openFuns).turnover += b.funPrice;
      r.money -= b.funPrice;
      r.mood += b.moodFun;
    }

    for (const k of Object.keys(r.avoid) as BuildingType[]) {
      const left = (r.avoid[k] ?? 0) - 1;
      if (left > 0) r.avoid[k] = left;
      else delete r.avoid[k];
    }

    r.mood += (r.outlook - r.mood) * b.moodRegression;
    r.mood = clamp(r.mood);
    if (r.mood < b.despairMood && chance(rng, b.despairLeaveChance)) leaveCity(r);
  }

  // Businesses: weak shops and venues lay off staff and close when nobody works there.
  const expected: Partial<Record<BuildingType, number>> = {
    shop: (state.initialPopulation * b.shopPrice) / Math.max(1, shops.length),
    entertainment: (state.initialPopulation * b.funChance * b.funPrice) / Math.max(1, funs.length),
  };
  for (const x of [...shops, ...funs]) {
    if (!x.open) continue;
    if (x.turnover < (expected[x.type] ?? 0) * b.layoffTurnoverShare) layOffOne(state, rng, x);
  }
  let workers = countWorkers(state.residents);
  for (const x of state.buildings) {
    if (!x.open || x.jobs === 0) continue;
    const staff = workers.get(x.id) ?? 0;
    const minStaff = x.type === 'factory' ? x.jobs * b.factoryCloseShare : 1;
    if (staff < minStaff) {
      x.open = false;
      for (const r of state.residents) if (r.job === x.id) r.job = null;
      notes.push(`${buildingDefOf(c, x.type).name} закрылся`);
    }
  }

  // The city defends itself when it is in trouble.
  const defense = state.metrics.cityIndex < b.defenseCityIndex;
  if (defense) {
    notes.push('Мэрия запустила опровержения и программу занятости');
    for (const r of state.residents) {
      if (r.status !== 'active') continue;
      if (r.quitFrom.length && chance(rng, b.defenseDebunkChance)) r.quitFrom = [];
      if (r.beliefs.length && chance(rng, b.defenseDebunkChance)) {
        r.beliefs.shift();
        r.outlook = clamp(r.outlook + b.fearPerBelief);
      }
    }
  }

  workers = countWorkers(state.residents);
  const rehire = b.rehireChance + (defense ? b.defenseRehireBonus : 0);
  for (const r of state.residents) {
    if (r.status !== 'active' || r.job !== null || r.protestTurns > 0) continue;
    const g = groupOf(c, r.group);
    if (g.jobs.length && chance(rng, rehire)) tryAssignJob(r, g, state.buildings, workers);
  }

  // A thriving city attracts newcomers.
  const activeCount = state.residents.filter((r) => r.status === 'active').length;
  if (state.metrics.cityIndex > b.growthCityIndex && activeCount < b.maxPopulation) {
    const homes = state.buildings.filter((x) => x.type === 'home');
    const arrivals = Math.min(b.growthPerTurn, b.maxPopulation - activeCount);
    for (let i = 0; i < arrivals; i++) {
      const g = weightedPick(
        rng,
        c.groups.map((x) => ({ ...x, weight: x.share })),
      );
      const r = newResident(c, rng, state.nextResidentId++, groupOf(c, g.id), homes[int(rng, homes.length)].id);
      tryAssignJob(r, groupOf(c, g.id), state.buildings, workers);
      state.residents.push(r);
    }
    if (arrivals > 0) notes.push(`В город переехали новые жители: ${arrivals}`);
  }

  state.metrics = computeMetrics(state, c);
  return notes;
}
