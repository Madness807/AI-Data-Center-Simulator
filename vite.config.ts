import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { precacheList } from './src/pwa/precache';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Tous les fichiers d'un dossier, récursivement. */
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));

/**
 * Service worker (build seulement) : sw.js est écrit après le build à partir de
 * src/pwa/sw.template.js, avec la liste des fichiers à garder hors ligne et une version tirée
 * de leur contenu (un nouveau build du jeu donne un nouveau service worker).
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'datacenter-ia:service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const urls = precacheList(walk(outDir).map((f) => relative(outDir, f).split(sep).join('/')));
      const hash = createHash('sha256');
      for (const url of urls) hash.update(url).update(readFileSync(join(outDir, url === './' ? 'index.html' : url)));
      const template = readFileSync(new URL('./src/pwa/sw.template.js', import.meta.url), 'utf8');
      const sw = template.replace('__VERSION__', hash.digest('hex').slice(0, 12)).replace('__PRECACHE__', JSON.stringify(urls, null, 2));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  // Version affichée sur l'écran titre et dans les rapports de bug.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [serviceWorker()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Sur macOS, si le rechargement ne se déclenche pas depuis Docker : VITE_USE_POLLING=true
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
