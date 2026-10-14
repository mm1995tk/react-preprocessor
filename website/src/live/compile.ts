import * as Babel from "@babel/standalone";
import * as prettierBabel from "prettier/plugins/babel";
import * as prettierEstree from "prettier/plugins/estree";
import * as prettierTypescript from "prettier/plugins/typescript";
import { format } from "prettier/standalone";
import * as React from "react";
import type { ComponentType } from "react";
import reactPreprocessor from "react-preprocessor/babel";

export type Compiled =
  /** `Component` is the last component the code exports, or `null` when it exports none */
  { ok: true; output: string; Component: ComponentType | null } | { ok: false; error: string };

const filename = "Example.tsx";
const options = { filename, babelrc: false, configFile: false, highlightCode: false };

const modules: Record<string, unknown> = { react: React, "react-preprocessor": {} };

const require = (name: string): unknown => {
  // Not `in`: it would also find inherited keys such as `constructor`
  if (Object.hasOwn(modules, name)) return modules[name];
  throw new Error(`"${name}" cannot be imported here. Only react and react-preprocessor can.`);
};

/**
 * Runs the preprocessor on code edited on the page, and makes a component of the result.
 *
 * Types are read as syntax, because the type checker is not available in the browser.
 * The code runs in this page, with full access to its origin, which every GitHub Pages site of
 * this account shares. That is safe only because the code is what the visitor typed into the editor.
 * Before the editor gets any other source (a link, saved drafts, a fetch, `postMessage`),
 * move the evaluation into an `<iframe sandbox="allow-scripts">` without `allow-same-origin`.
 */
export const compile = async (source: string): Promise<Compiled> => {
  try {
    const lowered =
      Babel.transform(source, { ...options, plugins: [[reactPreprocessor, { types: false }]] })
        ?.code ?? "";
    const output = await format(lowered, {
      parser: "typescript",
      plugins: [prettierBabel, prettierEstree, prettierTypescript],
      printWidth: 80,
    });

    // What the build tools do after the preprocessor: drop the types, compile JSX, link the modules
    const script =
      Babel.transform(lowered, {
        ...options,
        presets: ["typescript", ["react", { runtime: "classic" }]],
        plugins: ["transform-modules-commonjs"],
      })?.code ?? "";
    const exports: Record<string, unknown> = {};
    // oxlint-disable-next-line typescript/no-implied-eval -- running the visitor's own code is the point
    new Function("require", "exports", "React", script)(require, exports, React);
    const Component = Object.values(exports).findLast((value) => typeof value === "function");

    return { ok: true, output, Component: (Component as ComponentType | undefined) ?? null };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    return { ok: false, error: message.replace(`/${filename}: `, "").replace(`${filename}: `, "") };
  }
};
