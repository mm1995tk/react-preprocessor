import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { transformAsync } from "@babel/core";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { format } from "prettier";
import reactPreprocessorBabel from "react-preprocessor/babel";
import reactPreprocessor from "react-preprocessor/vite";
import { defineConfig, type Plugin } from "vite";

const root = import.meta.dirname;
const demos = resolve(root, "src/demos") + sep;

const lower = async (filename: string, source: string): Promise<string> => {
  const result = await transformAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    highlightCode: false,
    plugins: [reactPreprocessorBabel],
  });
  return format(result?.code ?? "", { filepath: filename, printWidth: 80 });
};

/**
 * Shows what the preprocessor does to a file, so that the page cannot drift from the real transform.
 *
 * - `import demo from "./Counter.tsx?demo"` gives `{ source, output }`: the file and its transform output
 * - `import demo from "./Rejected.tsx?rejected"` gives `{ source, error }`: the file and the build error it causes
 */
const demo = (): Plugin => {
  const prefix = "\0demo:";
  return {
    name: "website:demo",
    enforce: "pre",

    resolveId(source, importer) {
      const [path, query] = source.split("?");
      if (!path || !importer || (query !== "demo" && query !== "rejected")) return null;
      // The `\0` keeps the other plugins, react-preprocessor included, away from this module
      return `${prefix}${query}:${resolve(dirname(importer), path)}`;
    },

    async load(id) {
      if (!id.startsWith(prefix)) return null;
      const rest = id.slice(prefix.length);
      const kind = rest.slice(0, rest.indexOf(":"));
      const filename = resolve(rest.slice(kind.length + 1));
      // The dev server hands a requested id (`/@id/__x00__demo:...`) straight to `load`, without `resolveId`.
      // The path is therefore not trusted, and Vite's own `server.fs.allow` does not cover this read
      if (!filename.startsWith(demos)) return null;
      this.addWatchFile(filename);
      const source = await readFile(filename, "utf8");

      if (kind === "demo") {
        const output = await lower(filename, source);
        return `export default ${JSON.stringify({ source, output })};`;
      }

      try {
        await lower(filename, source);
      } catch (thrown) {
        const error = String((thrown as Error).message).replace(`${filename}: `, "");
        return `export default ${JSON.stringify({ source, error })};`;
      }
      return this.error(`${filename} was expected to be rejected by react-preprocessor.`);
    },
  };
};

export default defineConfig({
  // Served from https://mm1995tk.github.io/react-preprocessor/
  base: "/react-preprocessor/",
  // Order matters: lower the sugar to plain React first, then hand it to the React Compiler
  plugins: [demo(), reactPreprocessor(), react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    // The editable examples run the Babel plugin in the browser. There, Babel comes from @babel/standalone,
    // and the type checker (the only user of the Node.js modules) is turned off
    alias: [
      { find: /^@babel\/core$/, replacement: resolve(root, "src/live/babel-core.ts") },
      { find: /^node:(fs|module)$/, replacement: resolve(root, "src/live/node-stub.ts") },
    ],
  },
});
