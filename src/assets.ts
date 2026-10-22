declare const __ASSET_VERSION__: string;

/** Where the art lives: a folder renamed on every build so browsers never show stale sprites (vite.config.ts). */
export const ASSET_BASE = `${import.meta.env.BASE_URL}assets/${__ASSET_VERSION__ ? `${__ASSET_VERSION__}/` : ''}`;

/**
 * The dev preview (/dev/) shares the beta's origin and so its localStorage: its saves and settings
 * get their own keys, so the two builds never read each other's saves.
 */
export const STORAGE_SUFFIX = import.meta.env.BASE_URL.endsWith('/dev/') ? '-dev' : '';
