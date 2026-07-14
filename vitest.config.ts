import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/{api,web,worker}/src/**/*.test.{ts,tsx}', 'packages/shared/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: { lines: 70, functions: 70, statements: 70, branches: 60 },
    },
  },
});
