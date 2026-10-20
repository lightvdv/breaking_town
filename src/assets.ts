declare const __ASSET_VERSION__: string;

/** Where the art lives: a folder renamed on every build so browsers never show stale sprites (vite.config.ts). */
export const ASSET_BASE = `${import.meta.env.BASE_URL}assets/${__ASSET_VERSION__ ? `${__ASSET_VERSION__}/` : ''}`;
