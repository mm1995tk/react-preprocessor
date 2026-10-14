/* oxlint-disable oxc/no-this-in-exported-function -- webpack calls a loader with `this` */
import { transformAsync } from "@babel/core";
import babelPlugin from "./babel.ts";
import type { Options as BabelOptions } from "./babel.ts";

export type Options = BabelOptions;

/** The part of the `this` a webpack loader receives that is used here */
type LoaderContext = {
  resourcePath: string;
  getOptions?: () => Options;
  async(): (error: Error | null, code?: string, map?: unknown) => void;
};

/**
 * The webpack loader of react-preprocessor. Used with Next.js (Turbopack / webpack).
 *
 * It only lowers the sugar to plain React. Types and JSX are left as they are, so run it
 * before other loaders and the bundler's own transforms (SWC, React Compiler).
 */
export default function reactPreprocessorLoader(
  this: LoaderContext,
  source: string,
  inputMap?: unknown,
): void {
  const finish = this.async();
  const options = this.getOptions?.() ?? {};
  const filename = this.resourcePath;
  const importSource = options.importSource ?? "react-preprocessor";

  // Without types, a file that does not import the sugar is not even parsed
  const usesTypes = options.types !== false && /\.[cm]?tsx?$/.test(filename);
  if (filename.includes("/node_modules/") || (!usesTypes && !source.includes(importSource))) {
    finish(null, source, inputMap);
    return;
  }

  transformAsync(source, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    plugins: [[babelPlugin, options]],
  }).then(
    (result) => finish(null, result?.code ?? source, result?.map ?? inputMap),
    (error: Error) => finish(error),
  );
}
