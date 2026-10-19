import { reporterOf, type Content, type GameMode } from '../sim';
import { h } from './dom';

/**
 * The opening story (CONCEPT.md §1.1): who we are, why we ruin the town and how to win. Plays before
 * the first game over the live city; can be watched again from the menu.
 */
export interface IntroSlide {
  /** Picture in sprites/intro. */
  art: string;
  kicker: string;
  text: string;
}

export function introSlides(c: Content, mode: GameMode = 'destroy'): IntroSlide[] {
  const b = c.balance;
  // The stage a city falls into below a bound: goals speak of stages, never of the index (CONCEPT.md §2.3).
  const below = (bound: number) => b.cityStates.find((s) => s.min < bound)!.name;
  const reporter = reporterOf(c, b.startReporters[0]).name;
  // The other side of the same story (CONCEPT.md §8): the holding's tabloid against the town paper.
  if (mode === 'save') {
    return [
      {
        art: 'town',
        kicker: 'Где-то в провинции',
        text: `Тихий городок. ${b.population} жителей, завод, рынок и бар по пятницам. Здесь давно ничего не случалось.`,
      },
      {
        art: 'rival',
        kicker: 'Столица · «Медиа-Плюс»',
        text: 'Медиахолдинг проверяет теорию: страх продаётся лучше всего. Он купил местный «Вечерний Набат», и тот каждый день пугает город.',
      },
      {
        art: 'editor',
        kicker: 'Редакция «Городского Вестника»',
        text: `Вы — редактор последней честной газеты. Бюджет — ${b.startMoney} монет, в штате — один репортёр, ${reporter}.`,
      },
      {
        art: 'defend',
        kicker: 'Как это работает',
        text: 'Отправьте репортёра следить за «Набатом»: он найдёт, где тот соврал, и вы опровергнете ложь, пока она свежая. Печатайте хорошие новости, мирите группы. Можно и соврать — но если поймают, вам перестанут верить.',
      },
      {
        art: 'saved',
        kicker: 'Задание',
        text: `Продержитесь ${b.turnLimit} дней и не дайте городу скатиться в «${below(b.saveLoseIndex)}». Или разорите «Набат»: без читателей и доверия он закроется.`,
      },
    ];
  }
  return [
    {
      art: 'town',
      kicker: 'Где-то в провинции',
      text: `Тихий городок. ${b.population} жителей, завод, рынок и бар по пятницам. Здесь давно ничего не случалось.`,
    },
    {
      art: 'board',
      kicker: 'Столица · совет директоров «Медиа-Плюс»',
      text: 'Медиахолдинг проверяет теорию: страх продаётся лучше всего. Для опыта выбрали этот город и купили его газету за копейки.',
    },
    {
      art: 'editor',
      kicker: 'Редакция «Городского Вестника»',
      text: `Вы — новый главный редактор. Бюджет — ${b.startMoney} монет, в штате — один репортёр, ${reporter}. Остальных наймёте сами.`,
    },
    {
      art: 'method',
      kicker: 'Как это работает',
      text: 'Репортёры приносят новости. Вы решаете, что поставить на первую полосу и насколько приукрасить. Люди верят, пугаются, ссорятся друг с другом — и уезжают.',
    },
    {
      art: 'goal',
      kicker: 'Задание',
      text: `За ${b.turnLimit} дней доведите город до стадии «${below(b.winCityIndex)}». Не обанкротьтесь и не потеряйте репутацию: разоблачённая газета никому не нужна.`,
    },
    {
      art: 'reward',
      kicker: 'Награда',
      text: 'Докажете теорию — и совет директоров отдаст вам следующий город.',
    },
  ];
}

/** Shows the slides one by one; resolves when the player reaches the end or skips. */
export function playIntro(host: HTMLElement, c: Content, assetBase: string, mode: GameMode = 'destroy'): Promise<void> {
  const slides = introSlides(c, mode);
  return new Promise((resolve) => {
    let i = 0;
    const card = h('div', { class: 'intro-card' });
    const dots = h('div', { class: 'intro-dots' });
    const next = h('button', { class: 'primary big' });
    const layer = h(
      'div',
      { class: 'intro' },
      h('div', { class: 'letterbox top' }),
      h('div', { class: 'letterbox bottom' }),
      card,
      h('div', { class: 'intro-controls' }, dots, next, h('button', { class: 'ghost intro-skip', onclick: () => finish() }, 'Пропустить')),
    );
    const finish = () => {
      document.removeEventListener('keydown', onKey);
      layer.remove();
      resolve();
    };
    const show = () => {
      const s = slides[i];
      card.replaceChildren(
        h('img', { class: 'intro-art', src: `${assetBase}sprites/intro/${s.art}.png`, alt: '', width: 384, height: 216 }),
        h('span', { class: 'intro-kicker' }, s.kicker),
        h('p', { class: 'intro-text' }, s.text),
      );
      // Restart the slide-in animation.
      card.classList.remove('in');
      void card.offsetWidth;
      card.classList.add('in');
      dots.replaceChildren(...slides.map((_, k) => h('span', { class: k === i ? 'on' : '' })));
      next.textContent = i === slides.length - 1 ? 'К первому выпуску ▸' : 'Дальше ▸';
    };
    const advance = () => {
      if (i === slides.length - 1) return finish();
      i++;
      show();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        advance();
      }
    };
    next.addEventListener('click', advance);
    card.addEventListener('click', advance);
    document.addEventListener('keydown', onKey);
    host.append(layer);
    show();
    next.focus();
  });
}
