import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup-env.ts'],
    // All files share one Postgres container and reset its schema
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
