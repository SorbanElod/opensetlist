import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration test files share one database: parallel workers would
    // race on applying migrations (and on each other's rows). The suite
    // is small enough that serialization costs nothing measurable.
    fileParallelism: false,
  },
});
