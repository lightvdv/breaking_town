import {
  buildingDefOf,
  type CardEffect,
  type Content,
  type EffectType,
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
/** Framing of a conflict story between two groups (CONCEPT.md §5.5): calm, as is, heat, inflate. */
export const framingLabels = ['Успокоить', 'Как есть', 'Подогреть', 'Раздуть'];
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
    case 'fear':
      return 'Поверившие боятся выходить из дома: порядок падает, бары и магазины пустеют';
    case 'stigma': {
      const g = c.groups.find((x) => x.id === target)?.name.toLowerCase() ?? 'группа';
      return `Город ополчится: злость и протесты, а ${g} почувствуют травлю и начнут уезжать`;
    }
  }
}

export function outcomeText(o: Outcome): string {
  switch (o.reason) {
    case 'cityDestroyed':
      return 'Победа! Город опустел, а газета на плаву: страх продаётся. Совет директоров «Медиа-Плюс» доволен и отдаёт вам следующий город.';
    case 'bankrupt':
      return 'Поражение: газета разорилась. «Медиа-Плюс» сворачивает эксперимент и списывает вас вместе с убытками.';
    case 'trustCollapse':
      return 'Поражение: репутация упала до нуля — вам больше никто не верит. Холдинг отрекается от провалившегося редактора.';
    case 'turnLimit':
      return 'Поражение: время вышло, а город выстоял. Совет директоров разочарован: теорию придётся проверять с другим редактором.';
  }
}
