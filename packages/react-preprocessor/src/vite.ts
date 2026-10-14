import { transformAsync } from "@babel/core";
import type { Plugin } from "vite";
import babelPlugin from "./babel.ts";
import { createTypeService } from "./types.ts";
import type { Options as BabelOptions } from "./babel.ts";

export type Options = BabelOptions;

/**
 * The Vite plugin of react-preprocessor.
 *
 * It only lowers the sugar to plain React. Types and JSX are left as they are, so
 * the JSX transform and the React Compiler are done by plugins placed after this one.
 */
export default function reactPreprocessor(options: Options = {}): Plugin {
  const importSource = options.importSource ?? "react-preprocessor";
  const types =
    options.types === true || options.types === undefined ? createTypeService() : options.types;

  /** Files transformed using types */
  const typed = new Set<string>();

  return {
    name: "react-preprocessor",
    enforce: "pre",

    // Types also change when another file changes. Re-read whichever file changed
    watchChange() {
      if (types) types.invalidate();
    },

    handleHotUpdate({ file, modules, server }) {
      if (!types) return;
      types.invalidate();
      // Type-only imports are not in Vite's module graph. The result for a file transformed using types
      // can change whichever file changed, so all of them are transformed again
      const stale = [...typed]
        .filter((id) => id !== file)
        .flatMap((id) => [...(server.moduleGraph.getModulesByFile(id) ?? [])]);
      for (const module of stale) server.moduleGraph.invalidateModule(module);
      // If the changed file is not loaded from anywhere (a type-only file),
      // Vite does nothing. Make the page reload
      if (modules.length === 0 && /\.[cm]?tsx?$/.test(file) && stale.length > 0) {
        server.ws.send({ type: "full-reload" });
      }
    },

    async transform(code, id) {
      const [filename = id] = id.split("?");
      // An id starting with `\0` is a virtual module created by another plugin
      if (id.includes("\0") || !/\.[cm]?[jt]sx?$/.test(filename)) return null;
      if (filename.includes("/node_modules/")) return null;
      // Without types, a file that does not import the sugar is not even parsed.
      // With types, a file may receive reactive values through props without importing anything
      const usesTypes = types && /\.[cm]?tsx?$/.test(filename);
      if (!usesTypes && !code.includes(importSource)) return null;
      if (usesTypes) typed.add(filename);

      const result = await transformAsync(code, {
        filename,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        plugins: [[babelPlugin, { importSource, types }]],
      });
      if (!result?.code) return null;
      return { code: result.code, map: result.map ? JSON.stringify(result.map) : null };
    },
  };
}
