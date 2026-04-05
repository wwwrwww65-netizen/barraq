import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.js'],
    testTimeout: 30000,
    pool: 'forks',
  },
  resolve: {
    alias: {
      // keep paths stable if needed later
    },
  },
});
