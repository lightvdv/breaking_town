declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

/** The game's version from package.json (raised for each release to the beta / itch.io). */
export const APP_VERSION = __APP_VERSION__;
/** The commit the build was made from ('dev' on the dev server). */
export const APP_COMMIT = __APP_COMMIT__;
/** «v0.2.0 · a1b2c3d», shown at the bottom of the title screen and in «Об игре». */
export const versionLabel = `v${APP_VERSION}${APP_COMMIT ? ` · ${APP_COMMIT}` : ''}`;
