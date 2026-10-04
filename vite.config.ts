import { defineConfig } from 'vitest/config';

export default defineConfig({
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
