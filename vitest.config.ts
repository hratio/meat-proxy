import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'bin/**/*.test.mjs', 'dev/tooling/release/*.test.mjs'],
    testTimeout: 10_000,
    hookTimeout: 10_000
  }
});
