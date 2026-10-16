import { buildingDefOf, type CardEffect, type Content, type EffectType, type Outcome, type Topic } from '../sim';

export const truthLabels = ['Правда', 'Полуправда', 'Ложь'];
export const framingLabels = ['Нейтрально', 'Сенсация', 'Паника'];
export const distortionLabels = ['Как есть', 'Додумать', 'Исказить'];

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
};

export function effectText(c: Content, e: CardEffect | null): string {
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
  }
}

export function outcomeText(o: Outcome): string {
  switch (o.reason) {
    case 'cityDestroyed':
      return 'Победа! Город разрушен вашими новостями.';
    case 'exposure':
      return 'Поражение: шкала разоблачений заполнена, власти закрыли ваше СМИ.';
    case 'bankrupt':
      return 'Поражение: вы обанкротились.';
    case 'trustCollapse':
      return 'Поражение: вам больше никто не верит.';
    case 'turnLimit':
      return 'Поражение: время вышло, а город выстоял.';
  }
}
