import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "tsdown";

// The entries that are imported by users. Each gets a type declaration
const library = [
  "src/index.ts",
  "src/babel.ts",
  "src/vite.ts",
  "src/loader.ts",
  "src/eslint.ts",
  "src/jotai.ts",
  "src/jsx-runtime.ts",
  "src/jsx-dev-runtime.ts",
];

export default defineConfig({
  // `src/cli.ts` is the executable. Nobody imports it, so it gets no type declaration
  entry: [...library, "src/cli.ts"],
  format: "esm",
  tsconfig: "tsconfig.build.json",
  dts: { entry: library },
  platform: "node",
  external: [/^typescript/],
  plugins: [
    {
      // `import text from "./file.ts?raw"`: the content of the file as a string, as in Vite.
      // The CLI carries the source of `src/jotai.ts` this way, so it does not read it at runtime
      name: "raw",
      resolveId(source, importer) {
        if (!source.endsWith("?raw") || !importer) return null;
        return resolve(dirname(importer), source);
      },
      load(id) {
        if (!id.endsWith("?raw")) return null;
        const content = readFileSync(id.slice(0, -"?raw".length), "utf8");
        return { code: `export default ${JSON.stringify(content)};`, moduleType: "js" };
      },
    },
  ],
});
