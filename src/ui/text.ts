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
  doubted: 'не поверил',
  talk: 'пересказывает',
  outraged: 'возмущён разоблачением',
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
