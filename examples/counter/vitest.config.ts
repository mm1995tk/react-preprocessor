import { defineConfig } from "vitest/config";

// The tests themselves are not transformed. The dev server they start (vite.config.ts) does the transform
export default defineConfig({
  test: {
    include: ["e2e/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
