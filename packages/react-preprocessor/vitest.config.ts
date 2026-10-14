import { defineConfig } from "vitest/config";
import reactPreprocessor from "./src/vite.ts";

const source = (file: string): string => new URL(`./src/${file}`, import.meta.url).pathname;

export default defineConfig({
  // The tests themselves are written with the sugar. They go through the plugin in src, not the built package
  plugins: [reactPreprocessor()],
  resolve: {
    alias: [
      { find: /^react-preprocessor$/, replacement: source("index.ts") },
      { find: /^react-preprocessor\/jotai$/, replacement: source("jotai.ts") },
      { find: /^react-preprocessor\/(jsx-(?:dev-)?runtime)$/, replacement: source("$1.ts") },
    ],
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
