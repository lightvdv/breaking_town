import { tr } from './i18n';

/**
 * The loading screen (CONCEPT.md §7.3 «Загрузка»): `#boot` in index.html shows the PixelLab picture
 * and a bar from the first paint, before any script; the game is let in only when the city's art,
 * the interface pictures and the fonts are all here.
 */
const boot = () => document.getElementById('boot');

export function bootLabel(): void {
  const label = boot()?.querySelector('.boot-label');
  if (label) label.textContent = tr('Загрузка…');
}

/** 0..1 */
export function bootProgress(share: number): void {
  const bar = boot()?.querySelector<HTMLElement>('.boot-fill');
  if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%`;
}

export function bootDone(): void {
  const el = boot();
  if (!el) return;
  bootProgress(1);
  el.classList.add('done');
  window.setTimeout(() => el.remove(), 450);
}

export function bootFailed(message: string): void {
  const label = boot()?.querySelector('.boot-label');
  if (label) label.textContent = message;
  boot()?.classList.add('failed');
}

/** Loads pictures into the browser's cache, counting each one as it lands (failures count too). */
export function preloadImages(urls: string[], onProgress: (share: number) => void): Promise<void> {
  if (!urls.length) return Promise.resolve();
  let done = 0;
  return Promise.all(
    urls.map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => {
            onProgress(++done / urls.length);
            resolve();
          };
          img.src = src;
        }),
    ),
  ).then(() => undefined);
}
