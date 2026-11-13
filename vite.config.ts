import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

/**
 * Art in public/assets keeps its file names, so a browser would show yesterday's sprites from its
 * cache after a deploy. A build copies them into dist/assets/<version>/ instead, with a new version
 * on every build, and the game loads them from there (src/assets.ts). The dev server serves them as is.
 */
const version = `v${Date.now().toString(36)}`;
let outDir = 'dist';

/** The game's version (package.json, raised by hand for each release) and the commit it was built from. */
const appVersion = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
})();

export default defineConfig(({ command }) => ({
  // CI checks the beta out into beta-src next to master; its tests read master's files, so skip them.
  test: { exclude: [...configDefaults.exclude, 'beta-src/**'] },
  define: {
    __ASSET_VERSION__: JSON.stringify(command === 'build' ? version : ''),
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(command === 'build' ? commit : 'dev'),
  },
  plugins: [
    {
      name: 'versioned-assets',
      apply: 'build',
      configResolved(config) {
        outDir = config.build.outDir;
      },
      closeBundle() {
        const dist = join(process.cwd(), outDir, 'assets');
        const source = join(process.cwd(), 'public', 'assets');
        if (!existsSync(source)) return;
        cpSync(source, join(dist, version), { recursive: true });
        // The unversioned copies Vite put next to the bundles are not used any more.
        for (const name of readdirSync(source)) rmSync(join(dist, name), { recursive: true, force: true });
      },
    },
  ],
}));
