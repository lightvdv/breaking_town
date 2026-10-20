import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Art in public/assets keeps its file names, so a browser would show yesterday's sprites from its
 * cache after a deploy. A build copies them into dist/assets/<version>/ instead, with a new version
 * on every build, and the game loads them from there (src/assets.ts). The dev server serves them as is.
 */
const version = `v${Date.now().toString(36)}`;

export default defineConfig(({ command }) => ({
  define: { __ASSET_VERSION__: JSON.stringify(command === 'build' ? version : '') },
  plugins: [
    {
      name: 'versioned-assets',
      apply: 'build',
      closeBundle() {
        const dist = join(process.cwd(), 'dist', 'assets');
        const source = join(process.cwd(), 'public', 'assets');
        if (!existsSync(source)) return;
        cpSync(source, join(dist, version), { recursive: true });
        // The unversioned copies Vite put next to the bundles are not used any more.
        for (const name of readdirSync(source)) rmSync(join(dist, name), { recursive: true, force: true });
      },
    },
  ],
}));
