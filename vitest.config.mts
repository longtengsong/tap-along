import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/ui/**/*.test.ts'],
    setupFiles: ['tests/ui/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
});
