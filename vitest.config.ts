import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'tests/unit/**/*.test.ts',
            'tests/integration/**/*.test.ts',
          ],
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        // Runs the built CLI (dist/) as a child process. Needs `npm run build`.
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          testTimeout: 20_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The entry file only wires process globals into run(); run() is covered.
      exclude: ['src/cli.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
  },
});
