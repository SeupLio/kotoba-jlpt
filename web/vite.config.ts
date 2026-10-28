import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';

const swBuildId = {
  name: 'sw-build-id',
  apply: 'build' as const,
  closeBundle() {
    // Service Worker 的缓存名必须随每次构建变化，否则用户会一直拿到旧 JS/CSS
    const file = new URL('./dist/sw.js', import.meta.url);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__BUILD_ID__', Date.now().toString(36)));
  },
};

export default defineConfig({
  plugins: [react(), swBuildId],
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
  server: {
    port: 5173,
    host: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
