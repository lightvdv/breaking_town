import {
  buildingDefOf,
  type CardEffect,
  type CardInstance,
  type Content,
  type EffectType,
  type GameMode,
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
  scared: 'поверил плохому',
  happy: 'поверил хорошему',
  calm: 'принял к сведению',
  doubted: 'проигнорировал',
  talk: 'пересказывает',
  outraged: 'возмущён разоблачением',
};

/** Russian plural by number: 1 читатель, 2 читателя, 5 читателей. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** How the morning after the issue counts the reactions (CONCEPT.md §7.3). */
export const morningLabels: Record<Reaction, string> = {
  scared: 'испугались',
  happy: 'обрадовались',
  calm: 'приняли к сведению',
  doubted: 'проигнорировали',
  talk: 'пересказывают',
  outraged: 'возмутились',
};

export const truthLabels = ['Правда', 'Полуправда', 'Ложь'];
export const tierLabels = ['Скучная', 'Обычная', 'Интересная', 'Сенсация'];
export const scopeLabels: Record<NewsScope | 'any', string> = { local: 'Город', global: 'Мир', any: 'Город и мир' };
export const placementLabels = ['Заметка', 'Статья', 'Первая полоса'];
export const issueLevelLabels = ['Скучный', 'Обычный', 'Интересный', 'Сенсационный'];
/** Game modes as the title screen names them (CONCEPT.md §8). */
export const modeLabels: Record<GameMode, string> = { destroy: 'Разрушить город', save: 'Спасти город' };
/** Cover price levels of the paper (CONCEPT.md §3.4), from free to dear. */
export const priceLabels = ['Бесплатно', 'Дёшево', 'Как у всех', 'Дорого'];
/** Framing of a conflict story between two groups (CONCEPT.md §5.5): calm, as is, heat, inflate. */
export const framingLabels = ['Успокоить', 'Как есть', 'Подогреть', 'Раздуть'];
/**
 * How a story is told (CONCEPT.md §3.1): «Всё хорошо!» and «Без паники» soothe a bad story (a lie and
 * a half-truth), «Как есть» is the truth, «Это неспроста» and «Всё пропало!» blow it up.
 */
export const toneLabels = ['Как есть', 'Это неспроста', 'Всё пропало!'];
export const soothingLabels = ['Без паники', 'Всё хорошо!'];

/** The name of the option for this story at this distortion; conflict stories keep their framing scale. */
export function toneOf(card: CardInstance, distortion: number): string {
  if (card.conflict) return framingLabels[distortion < 0 ? 0 : Math.min(2, card.baseTruth + distortion) + 1];
  if (distortion < 0) return soothingLabels[Math.min(2, -distortion) - 1];
  return toneLabels[Math.min(2, card.baseTruth + distortion)];
}

/** Relations between two groups by tension level. */
export const tensionLabels = ['Мир', 'Трения', 'Вражда', 'Столкновения'];

export const topicLabels: Record<Topic, string> = {
  factory: 'Завод',
  food: 'Еда',
  fun: 'Досуг',
  health: 'Здоровье',
  power: 'Власть',
  crime: 'Криминал',
};

export const effectLabels: Record<EffectType, string> = {
  quitJob: 'уволились',
  avoid: 'избегают',
  leaveCity: 'уехали',
  protest: 'протестуют',
  moodDown: 'расстроились',
  moodUp: 'обрадовались',
  stigma: 'ополчились',
  fear: 'боятся выходить',
  debunk: 'разубедились',
};

export function effectText(c: Content, e: CardEffect | null, target?: string): string {
  if (!e) return 'Без эффекта';
  const building = e.building ? buildingDefOf(c, e.building).name.toLowerCase() : '';
  switch (e.type) {
    case 'quitJob':
      return `Поверившие увольняются: ${building}`;
    case 'avoid':
      return `Поверившие избегают: ${building}`;
    case 'leaveCity':
      return 'Поверившие уезжают из города';
    case 'protest':
      return 'Поверившие выходят на протест';
    case 'moodDown':
      return 'Поверившие расстраиваются';
    case 'moodUp':
      return 'Поверившие радуются';
    case 'debunk':
      return 'Поверившие перестанут верить той новости, а газете, которая её напечатала, — доверять';
    case 'fear':
      return 'Поверившие боятся выходить из дома: порядок падает, бары и магазины пустеют';
    case 'stigma': {
      const g = c.groups.find((x) => x.id === target)?.name.toLowerCase() ?? 'группа';
      return `Город ополчится: злость и протесты, а ${g} почувствуют травлю и начнут уезжать`;
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
  if (!e) return 'ничего не изменит';
  const building = e.building ? buildingDefOf(c, e.building).name.toLowerCase() : '';
  const by = (light: string, normal: string, strong: string) => [light, normal, strong][step];
  switch (e.type) {
    case 'quitJob':
      return by(`задумаются, не уволиться ли: ${building}`, `захотят уволиться: ${building}`, `будут рваться уволиться: ${building}`);
    case 'avoid':
      return by(`подумают, стоит ли ходить: ${building}`, `захотят обходить: ${building}`, `захотят обходить за версту: ${building}`);
    case 'leaveCity':
      return by('задумаются об отъезде', 'заговорят об отъезде', 'всерьёз захотят уехать');
    case 'protest':
      return by('начнут ворчать на власти', 'захотят выйти протестовать', 'будут рваться на площадь');
    case 'moodDown':
      return by('немного приуныют', 'расстроятся', 'впадут в уныние');
    case 'moodUp':
      return by('чуть повеселеют — городу лучше', 'обрадуются — городу лучше', 'воспрянут духом — городу лучше');
    case 'debunk':
      return 'передумают';
    case 'fear':
      return by('станут опасаться выходить по вечерам', 'будут бояться выходить', 'в панике будут бояться выйти на улицу');
    case 'stigma':
      return by('косо посмотрят на группу', 'ополчатся на группу', 'возненавидят группу');
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

/** The rival paper of each mode in the forms the interface needs (CONCEPT.md §8). */
export const rivalNames: Record<RivalKind, { name: string; short: string; gen: string; ins: string }> = {
  tabloid: { name: 'Вечерний Набат', short: 'Набат', gen: 'Набата', ins: 'Набатом' },
  guardian: { name: 'Голос города', short: 'Голос', gen: 'Голоса', ins: 'Голосом' },
};

/** Buildings a «close» goal names, in the accusative: «закрыть завод». */
const closeNames: Partial<Record<BuildingType, string>> = {
  factory: 'завод',
  shop: 'все магазины',
  entertainment: 'все бары',
  hospital: 'больницу',
  police: 'полицию',
  cityHall: 'мэрию',
  factCheckers: 'фактчекеров',
};

/** «Закрыть 2 бара / 5 баров». */
const closeCounted: Partial<Record<BuildingType, [string, string]>> = {
  shop: ['магазина', 'магазинов'],
  entertainment: ['бара', 'баров'],
};

/** A town's main goal in words (CONCEPT.md §9.2), as an order: «Закрыть завод». */
export function goalTitle(c: Content, g: TownGoal): string {
  switch (g.type) {
    case 'stage': {
      const stage = c.balance.cityStates.find((s) => s.min < g.index)!.name;
      return g.index <= 30 ? `Стереть город с лица земли — довести до «${stage}»` : `Довести город до стадии «${stage}»`;
    }
    case 'close':
      return g.count ? `Закрыть ${g.count} ${(closeCounted[g.building] ?? [g.building, g.building])[g.count < 5 ? 0 : 1]}` : `Закрыть ${closeNames[g.building] ?? g.building}`;
    case 'drive':
      return `Выжить из города ${Math.round(g.share * 100)}% ${groupOf(c, g.group).forms.manyGen}`;
    case 'clashes':
      return `Довести горожан до драк и держать так ${g.days} ${g.days === 1 ? 'день' : g.days < 5 ? 'дня' : 'дней'} подряд`;
    case 'rival':
      return 'Закрыть «Голос города»';
    case 'gang':
      return 'Отдать улицы банде';
  }
}

/** How far the goal is, one short line: «открыто: 1», «уехало 12 из 30», «драки 2 из 3 дней». */
export function goalLine(p: GoalProgress): string {
  const g = p.goal;
  switch (g.type) {
    case 'stage':
      return `индекс города ${p.now}, нужно ниже ${p.need}`;
    case 'close':
      return `закрыто ${p.now} из ${p.need}${p.staff && !p.done ? ` · работают ${p.staff.workers} из ${p.staff.jobs}` : ''}`;
    case 'drive':
      return `уехало ${p.now} из ${p.need}`;
    case 'clashes':
      return `драки ${p.now} из ${p.need} дней подряд`;
    case 'rival':
      return p.done ? '«Голос» закрыт' : '«Голос» ещё выходит';
    case 'gang':
      return p.done ? 'банда хозяйничает' : `порядок ${p.now}%, банда придёт ниже ${p.need}%`;
  }
}

export function outcomeText(o: Outcome, mode: GameMode = 'destroy', goal = ''): string {
  switch (o.reason) {
    case 'goalDone':
      return `Победа! ${goal ? `${goal} — сделано. ` : ''}Совет директоров «Медиа-Плюс» доволен и отдаёт вам следующий город.`;
    case 'cityDestroyed':
      return 'Победа! Город опустел, а газета на плаву: страх продаётся. Совет директоров «Медиа-Плюс» доволен и отдаёт вам следующий город.';
    case 'bankrupt':
      return 'Поражение: газета разорилась. «Медиа-Плюс» сворачивает эксперимент и списывает вас вместе с убытками.';
    case 'trustCollapse':
      return 'Поражение: репутация упала до нуля — вам больше никто не верит. Холдинг отрекается от провалившегося редактора.';
    case 'turnLimit':
      return 'Поражение: время вышло, а город выстоял. Совет директоров разочарован: теорию придётся проверять с другим редактором.';
    case 'citySaved':
      return 'Победа! Город выстоял: «Набат» пугал, а люди остались, работали и ходили в бары. Опыт «Медиа-Плюс» провалился.';
    case 'rivalClosed':
      return mode === 'save'
        ? 'Победа! «Вечерний Набат» закрылся: ему больше никто не верит и его никто не покупает. Холдинг ищет другой город.'
        : 'Победа! «Голос города» закрылся: защищать город больше некому. Совет директоров доволен и отдаёт вам следующий город.';
    case 'cityFallen':
      return 'Поражение: город не выдержал страха, ссор и безработицы. «Медиа-Плюс» празднует, «Вестник» остался без читателей.';
  }
}

/**
 * How likely fact-checkers catch a story (CONCEPT.md §7.3 «Риск выпуска»): the red pencil's note in
 * the margin, by risk step (`riskStep`).
 */
export const riskNotes = ['— вряд ли проверят', '— могут проверить', '— скорее всего проверят', '— проверят почти наверняка'];

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
  clean: ['ЧИСТО', 'всё правда'],
  risk: ['РИСК', 'ложь могут найти'],
  danger: ['ОПАСНО', 'могут поймать'],
};
