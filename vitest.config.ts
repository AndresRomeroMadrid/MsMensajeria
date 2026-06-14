import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/config/**', 'src/index.ts', 'src/app.ts', 'src/routes/**'],
      thresholds: { lines: 70 },
    },
  },
});
