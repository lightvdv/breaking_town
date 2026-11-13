import { tr } from '../i18n';
import { reporterOf, type Content } from '../sim';
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

export function introSlides(c: Content): IntroSlide[] {
  const b = c.balance;
  // The stage a city falls into below a bound: goals speak of stages, never of the index (CONCEPT.md §2.3).
  const below = (bound: number) => b.cityStates.find((s) => s.min < bound)!.name;
  const reporter = reporterOf(c, b.startReporters[0]).name;
  return [
    {
      art: 'town',
      kicker: tr('Где-то в провинции'),
      text: tr('Тихий городок. {0} жителей, завод, рынок и бар по пятницам. Здесь давно ничего не случалось.', b.population),
    },
    {
      art: 'board',
      kicker: tr('Столица · совет директоров «Медиа-Плюс»'),
      text: tr('Медиахолдинг проверяет теорию: страх продаётся лучше всего. Для опыта выбрали этот город и купили его газету за копейки.'),
    },
    {
      art: 'editor',
      kicker: tr('Редакция «Городского Вестника»'),
      text: tr('Вы — новый главный редактор. В штате — один репортёр, {0}. Остальных наймёте сами, когда у газеты прибавится читателей.', reporter),
    },
    {
      art: 'method',
      kicker: tr('Как это работает'),
      text: tr('Репортёры приносят новости. Вы решаете, что поставить на первую полосу и насколько приукрасить. Люди верят, пугаются и ссорятся.'),
    },
    {
      art: 'goal',
      kicker: tr('Задание'),
      text: tr('За {0} дней доведите город до стадии «{1}». Не обанкротьтесь и не потеряйте репутацию: разоблачённая газета никому не нужна.', b.turnLimit, below(b.winCityIndex)),
    },
    {
      art: 'reward',
      kicker: tr('Награда'),
      text: tr('Докажете теорию — и совет директоров отдаст вам следующий город.'),
    },
  ];
}

/** Shows the slides one by one; resolves when the player reaches the end or skips. */
export function playIntro(host: HTMLElement, c: Content, assetBase: string): Promise<void> {
  const slides = introSlides(c);
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
      h('div', { class: 'intro-controls' }, dots, next, h('button', { class: 'ghost intro-skip', onclick: () => finish() }, tr('Пропустить'))),
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
      next.textContent = i === slides.length - 1 ? tr('К первому выпуску ▸') : tr('Дальше ▸');
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
