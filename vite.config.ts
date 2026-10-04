import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Version affichée sur l'écran titre et dans les rapports de bug.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
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
