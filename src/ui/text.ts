import { tr } from '../i18n';
import {
  buildingDefOf,
  type CardEffect,
  type CardInstance,
  type Content,
  type EffectType,
  type RivalKind,
  type NewsScope,
  type Outcome,
  type TownGoal,
  type BuildingType,
  type GoalProgress,
  groupOf,
  type Reaction,
  type Topic,
} from '../sim';

export const reactionLabels: Record<Reaction, string> = {
  scared: tr('поверил плохому'),
  happy: tr('поверил хорошему'),
  calm: tr('принял к сведению'),
  doubted: tr('проигнорировал'),
  talk: tr('пересказывает'),
  outraged: tr('возмущён разоблачением'),
};

export { plural } from '../i18n';

/** How the morning after the issue counts the reactions (CONCEPT.md §7.3). */
export const morningLabels: Record<Reaction, string> = {
  scared: tr('испугались'),
  happy: tr('обрадовались'),
  calm: tr('приняли к сведению'),
  doubted: tr('проигнорировали'),
  talk: tr('пересказывают'),
  outraged: tr('возмутились'),
};

export const truthLabels = [tr('Правда'), tr('Полуправда'), tr('Ложь')];
export const tierLabels = [tr('Скучная'), tr('Обычная'), tr('Интересная'), tr('Сенсация')];
export const scopeLabels: Record<NewsScope | 'any', string> = { local: tr('Город'), global: tr('Мир'), any: tr('Город и мир') };
export const placementLabels = [tr('Заметка'), tr('Статья'), tr('Первая полоса')];
export const issueLevelLabels = [tr('Скучный'), tr('Обычный'), tr('Интересный'), tr('Сенсационный')];
/** The game mode as the title screen names it. */
/** Framing of a conflict story between two groups (CONCEPT.md §5.5): calm, as is, heat, inflate. */
export const framingLabels = [tr('Успокоить'), tr('Как есть'), tr('Подогреть'), tr('Раздуть')];
/**
 * How a story is told (CONCEPT.md §3.1): «Всё хорошо!» and «Без паники» soothe a bad story (a lie and
 * a half-truth), «Как есть» is the truth, «Это неспроста» and «Всё пропало!» blow it up.
 */
export const toneLabels = [tr('Как есть'), tr('Это неспроста'), tr('Всё пропало!')];
export const soothingLabels = [tr('Без паники'), tr('Всё хорошо!')];

/** The name of the option for this story at this distortion; conflict stories keep their framing scale. */
export function toneOf(card: CardInstance, distortion: number): string {
  if (card.conflict) return framingLabels[distortion < 0 ? 0 : Math.min(2, card.baseTruth + distortion) + 1];
  if (distortion < 0) return soothingLabels[Math.min(2, -distortion) - 1];
  return toneLabels[Math.min(2, card.baseTruth + distortion)];
}

/** Relations between two groups by tension level. */
export const tensionLabels = [tr('Мир'), tr('Трения'), tr('Вражда'), tr('Столкновения')];

export const topicLabels: Record<Topic, string> = {
  factory: tr('Завод'),
  food: tr('Еда'),
  fun: tr('Досуг'),
  health: tr('Здоровье'),
  power: tr('Власть'),
  crime: tr('Криминал'),
};

export const effectLabels: Record<EffectType, string> = {
  quitJob: tr('уволились'),
  avoid: tr('избегают'),
  leaveCity: tr('уехали'),
  protest: tr('протестуют'),
  moodDown: tr('расстроились'),
  moodUp: tr('обрадовались'),
  stigma: tr('ополчились'),
  fear: tr('боятся выходить'),
  debunk: tr('разубедились'),
};

export function effectText(c: Content, e: CardEffect | null, target?: string): string {
  if (!e) return tr('Без эффекта');
  const building = e.building ? buildingDefOf(c, e.building).name.toLowerCase() : '';
  switch (e.type) {
    case 'quitJob':
      return tr('Поверившие увольняются: {0}', building);
    case 'avoid':
      return tr('Поверившие избегают: {0}', building);
    case 'leaveCity':
      return tr('Поверившие уезжают из города');
    case 'protest':
      return tr('Поверившие выходят на протест');
    case 'moodDown':
      return tr('Поверившие расстраиваются');
    case 'moodUp':
      return tr('Поверившие радуются');
    case 'debunk':
      return tr('Поверившие перестанут верить той новости, а газете, которая её напечатала, — доверять');
    case 'fear':
      return tr('Поверившие боятся выходить из дома: порядок падает, бары и магазины пустеют');
    case 'stigma': {
      const g = c.groups.find((x) => x.id === target)?.name.toLowerCase() ?? tr('группа');
      return tr('Город ополчится: злость и протесты, а {0} почувствуют травлю и начнут уезжать', g);
    }
  }
}

/** How hard the believers react, by the story's impact: light, normal, strong (CONCEPT.md §7.3). */
export function impactStep(impact: number): 0 | 1 | 2 {
  return impact < 0.6 ? 0 : impact < 1 ? 1 : 2;
}

/**
 * The effect in a few words for the truth menu (CONCEPT.md §7.3): what the believers will want to do,
 * and how hard — intentions, not deeds: each of them acts on it only by chance.
 */
export function effectShort(c: Content, e: CardEffect | null, impact = 0.8, step: 0 | 1 | 2 = impactStep(impact)): string {
  if (!e) return tr('ничего не изменит');
  const building = e.building ? buildingDefOf(c, e.building).name.toLowerCase() : '';
  const by = (light: string, normal: string, strong: string) => [light, normal, strong][step];
  switch (e.type) {
    case 'quitJob':
      return by(tr('задумаются, не уволиться ли: {0}', building), tr('захотят уволиться: {0}', building), tr('будут рваться уволиться: {0}', building));
    case 'avoid':
      return by(tr('подумают, стоит ли ходить: {0}', building), tr('захотят обходить: {0}', building), tr('захотят обходить за версту: {0}', building));
    case 'leaveCity':
      return by(tr('задумаются об отъезде'), tr('заговорят об отъезде'), tr('всерьёз захотят уехать'));
    case 'protest':
      return by(tr('начнут ворчать на власти'), tr('захотят выйти протестовать'), tr('будут рваться на площадь'));
    case 'moodDown':
      return by(tr('немного приуныют'), tr('расстроятся'), tr('впадут в уныние'));
    case 'moodUp':
      return by(tr('чуть повеселеют — городу лучше'), tr('обрадуются — городу лучше'), tr('воспрянут духом — городу лучше'));
    case 'debunk':
      return tr('передумают');
    case 'fear':
      return by(tr('станут опасаться выходить по вечерам'), tr('будут бояться выходить'), tr('в панике будут бояться выйти на улицу'));
    case 'stigma':
      return by(tr('косо посмотрят на группу'), tr('ополчатся на группу'), tr('возненавидят группу'));
  }
}

/** One telling of a story in the truth menu: its effect, expected believers and strength per believer. */
export interface FramingOption {
  dist: number;
  effect: CardEffect | null;
  believers: number;
  impact: number;
}

const harmful = (e: CardEffect | null) => !!e && e.type !== 'moodUp' && e.type !== 'debunk';
/** Expected result of a telling: believers × strength (what the sim guarantees to grow, `louderGain`). */
const resultOf = (o: FramingOption) => o.believers * o.impact * (o.effect?.strength ?? 0);

/**
 * How the truth menu words each telling (CONCEPT.md §7.3): a louder telling of the same effect hits
 * harder, so its words are always stronger than the step below («подумают, стоит ли ходить» →
 * «захотят обходить» → «захотят обходить за версту»), and next to the mildest frightening telling it
 * says how much harder it hits overall («сильнее ×1.6»), though fewer believe it.
 */
export function framingScale(options: FramingOption[]): Map<number, { step: 0 | 1 | 2; ratio: number | null }> {
  const out = new Map<number, { step: 0 | 1 | 2; ratio: number | null }>();
  const sorted = [...options].sort((a, b) => a.dist - b.dist);
  const ref = sorted.find((o) => o.dist >= 0 && harmful(o.effect) && resultOf(o) > 0);
  let prev: FramingOption | null = null;
  let prevStep: 0 | 1 | 2 = 0;
  for (const o of sorted) {
    let step = impactStep(o.impact);
    if (prev && o.dist > 0 && prev.effect && o.effect && prev.effect.type === o.effect.type && resultOf(o) > resultOf(prev)) {
      step = Math.max(step, Math.min(2, prevStep + 1)) as 0 | 1 | 2;
    }
    const ratio = ref && o.dist > ref.dist && harmful(o.effect) ? resultOf(o) / resultOf(ref) : null;
    out.set(o.dist, { step, ratio });
    prev = o;
    prevStep = step;
  }
  return out;
}

/** The rival paper in the forms the interface needs (CONCEPT.md §8). */
export const rivalNames: Record<RivalKind, { name: string; short: string; gen: string; ins: string }> = {
  guardian: { name: tr('Голос города'), short: tr('Голос'), gen: tr('Голоса'), ins: tr('Голосом') },
};

/** Buildings a «close» goal names, in the accusative: «закрыть завод». */
const closeNames: Partial<Record<BuildingType, string>> = {
  factory: tr('завод'),
  shop: tr('все магазины'),
  entertainment: tr('все бары'),
  hospital: tr('больницу'),
  police: tr('полицию'),
  cityHall: tr('мэрию'),
  factCheckers: tr('фактчекеров'),
};

/** «Закрыть 2 бара / 5 баров». */
const closeCounted: Partial<Record<BuildingType, [string, string]>> = {
  shop: [tr('магазина'), tr('магазинов')],
  entertainment: [tr('бара'), tr('баров')],
};

/** A town's main goal in words (CONCEPT.md §9.2), as an order: «Закрыть завод». */
export function goalTitle(c: Content, g: TownGoal): string {
  switch (g.type) {
    case 'stage': {
      const stage = c.balance.cityStates.find((s) => s.min < g.index)!.name;
      return g.index <= 30 ? tr('Стереть город с лица земли — довести до «{0}»', stage) : tr('Довести город до стадии «{0}»', stage);
    }
    case 'close':
      return g.count ? tr('Закрыть {0} {1}', g.count, (closeCounted[g.building] ?? [g.building, g.building])[g.count < 5 ? 0 : 1]) : tr('Закрыть {0}', closeNames[g.building] ?? g.building);
    case 'drive':
      return tr('Выжить из города {0}% {1}', Math.round(g.share * 100), groupOf(c, g.group).forms.manyGen);
    case 'clashes':
      return tr('Довести горожан до драк и держать так {0} {1} подряд', g.days, g.days === 1 ? tr('день') : g.days < 5 ? tr('дня') : tr('дней'));
    case 'rival':
      return tr('Закрыть «Голос города»');
    case 'gang':
      return tr('Отдать улицы банде');
  }
}

/** How far the goal is, one short line: «открыто: 1», «уехало 12 из 30», «драки 2 из 3 дней». */
export function goalLine(p: GoalProgress): string {
  const g = p.goal;
  switch (g.type) {
    case 'stage':
      return tr('индекс города {0}, нужно ниже {1}', p.now, p.need);
    case 'close':
      return tr('закрыто {0} из {1}{2}', p.now, p.need, p.staff && !p.done ? tr(' · работают {0} из {1}', p.staff.workers, p.staff.jobs) : '');
    case 'drive':
      return tr('уехало {0} из {1}', p.now, p.need);
    case 'clashes':
      return tr('драки {0} из {1} дней подряд', p.now, p.need);
    case 'rival':
      return p.done ? tr('«Голос» закрыт') : tr('«Голос» ещё выходит');
    case 'gang':
      return p.done ? tr('банда хозяйничает') : tr('порядок {0}%, банда придёт ниже {1}%', p.now, p.need);
  }
}

export function outcomeText(o: Outcome, goal = ''): string {
  switch (o.reason) {
    case 'goalDone':
      return tr('Победа! {0}Совет директоров «Медиа-Плюс» доволен и отдаёт вам следующий город.', goal ? tr('{0} — сделано. ', goal) : '');
    case 'cityDestroyed':
      return tr('Победа! Город опустел, а газета на плаву: страх продаётся. Совет директоров «Медиа-Плюс» доволен и отдаёт вам следующий город.');
    case 'trustCollapse':
      return tr('Поражение: репутация упала до нуля — вам больше никто не верит. Холдинг отрекается от провалившегося редактора.');
    case 'turnLimit':
      return tr('Поражение: время вышло, а город выстоял. Совет директоров разочарован: теорию придётся проверять с другим редактором.');
    case 'rivalClosed':
      return tr('Победа! «Голос города» закрылся: защищать город больше некому. Совет директоров доволен и отдаёт вам следующий город.');
  }
}

/**
 * How likely fact-checkers catch a story (CONCEPT.md §7.3 «Риск выпуска»): the red pencil's note in
 * the margin, by risk step (`riskStep`).
 */
export const riskNotes = [tr('— вряд ли проверят'), tr('— могут проверить'), tr('— скорее всего проверят'), tr('— проверят почти наверняка')];

/** 0–3 by a story's exposure risk: under 10%, 25%, 45% and above. */
export function riskStep(risk: number): number {
  return risk < 0.1 ? 0 : risk < 0.25 ? 1 : risk < 0.45 ? 2 : 3;
}

/**
 * The editor's stamp on the issue: all true, a risk (some lie may be caught) or a danger (at least
 * a 30% chance one is caught today); null when nothing untrue can be caught (or nothing is printed).
 */
export type IssueStamp = 'clean' | 'risk' | 'danger';
export function issueStampOf(untrue: number, risk: number, printed: number): IssueStamp | null {
  if (!printed) return null;
  if (!untrue) return 'clean';
  if (risk <= 0) return null;
  return risk < 0.3 ? 'risk' : 'danger';
}
export const stampLabels: Record<IssueStamp, [string, string]> = {
  clean: [tr('ЧИСТО'), tr('всё правда')],
  risk: [tr('РИСК'), tr('ложь могут найти')],
  danger: [tr('ОПАСНО'), tr('могут поймать')],
};
