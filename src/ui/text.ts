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
  type Reaction,
  type Topic,
} from '../sim';

export const reactionLabels: Record<Reaction, string> = {
  scared: 'поверил плохому',
  happy: 'поверил хорошему',
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

/** The effect in a few words for the truth menu (CONCEPT.md §7.3): what the believers will do. */
export function effectShort(c: Content, e: CardEffect | null): string {
  if (!e) return 'ничего не изменит';
  const building = e.building ? buildingDefOf(c, e.building).name.toLowerCase() : '';
  switch (e.type) {
    case 'quitJob':
      return `уволятся: ${building}`;
    case 'avoid':
      return `будут обходить: ${building}`;
    case 'leaveCity':
      return 'задумаются об отъезде';
    case 'protest':
      return 'выйдут протестовать';
    case 'moodDown':
      return 'расстроятся';
    case 'moodUp':
      return 'обрадуются — городу лучше';
    case 'debunk':
      return 'передумают';
    case 'fear':
      return 'будут бояться выходить';
    case 'stigma':
      return 'ополчатся на группу';
  }
}

/** The rival paper of each mode in the forms the interface needs (CONCEPT.md §8). */
export const rivalNames: Record<RivalKind, { name: string; short: string; gen: string; ins: string }> = {
  tabloid: { name: 'Вечерний Набат', short: 'Набат', gen: 'Набата', ins: 'Набатом' },
  guardian: { name: 'Голос города', short: 'Голос', gen: 'Голоса', ins: 'Голосом' },
};

export function outcomeText(o: Outcome, mode: GameMode = 'destroy'): string {
  switch (o.reason) {
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
