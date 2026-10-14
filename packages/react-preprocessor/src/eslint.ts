import { readFileSync, statSync } from "node:fs";
import { transformSync } from "@babel/core";
import babelPlugin from "./babel.ts";
import type { Diagnostic } from "./babel.ts";
import { createTypeService } from "./types.ts";
import type { TypeService } from "./types.ts";

export type Options = {
  /** Name of the module the sugar is imported from. Defaults to `react-preprocessor`. */
  importSource?: string;
  /** Asks the type checker which props are reactive, as the build does. Defaults to `true`. */
  types?: boolean;
};

// The parts of the rule API of ESLint (and of oxlint's JS plugins) that are used here.
// Written out so that the types of this module do not depend on ESLint. They are no narrower than
// ESLint's own, so that the plugin can be given where ESLint's types expect one (`defineConfig`)
type Position = { line: number; column: number };
type Context = {
  filename: string;
  options: readonly unknown[];
  sourceCode: unknown;
  report(descriptor: { loc: { start: Position; end: Position }; message: string }): void;
};
export type Rule = {
  meta: {
    type: "problem";
    docs: { description: string };
    schema: unknown[];
  };
  create(context: Context): { Program(): void };
};
export type Plugin = {
  meta: { name: string };
  rules: { "valid-sugar": Rule };
  configs: {
    /** For a flat config: `export default [reactPreprocessor.configs.recommended]` */
    recommended: { plugins: { "react-preprocessor": Plugin }; rules: Record<string, "error"> };
  };
};

const isTypeScript = (filename: string): boolean => /\.[cm]?tsx?$/.test(filename);

// The type checker is slow to start. It is reused across files, as in the build
let service: TypeService | undefined;
/** When the type checker last read the files on disk: when it was created or last invalidated */
let readAt = 0;
/** The modification time of each file when it was last linted */
const modified = new Map<string, number>();
/** Whether it has been reported that the type checker could not be started. It is said once, not per file */
let startFailureReported = false;

/**
 * The type checker reads files from disk, and an editor lints the text being edited.
 * The types are asked only while the two match: the result is then the one the build gives.
 * Returns null when they differ, i.e. the file has unsaved changes.
 */
const typesFor = (filename: string, code: string): TypeService | null => {
  let onDisk: string;
  try {
    onDisk = readFileSync(filename, "utf8");
  } catch {
    return null;
  }
  if (onDisk !== code) return null;
  if (!service) {
    service = createTypeService();
    readAt = Date.now();
  }
  // A file saved since the type checker read the files means they have changed (in an editor, saving
  // lints the file again). The type checker then reads them again.
  // A file linted before was saved if its modification time changed. A file linted for the first time
  // may still be one the type checker read as a dependency of another; it was saved after that read if
  // it is newer. Linux stamps files with a coarse clock, a few milliseconds behind `Date.now()`, hence the margin
  const mtime = statSync(filename).mtimeMs;
  const previous = modified.get(filename);
  modified.set(filename, mtime);
  if (previous === undefined ? mtime >= readAt - 20 : mtime !== previous) {
    service.invalidate();
    readAt = Date.now();
  }
  return service;
};

/** The first line of a message, without the file name Babel puts in front */
const firstLine = (message: string): string =>
  message.split("\n")[0]!.replace(/^.*?: react-preprocessor: /, "");

const validSugar: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Report the misuses of the sugar that the build rejects" },
    schema: [
      {
        type: "object",
        properties: { importSource: { type: "string" }, types: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    return {
      Program() {
        const { filename } = context;
        const options = (context.options[0] ?? {}) as Options;
        const { text, hasBOM } = context.sourceCode as { text: string; hasBOM?: boolean };
        const importSource = options.importSource ?? "react-preprocessor";
        if (/[\\/]node_modules[\\/]/.test(filename)) return;
        // ESLint gives the text without the byte order mark. The file on disk has it
        const code = (hasBOM ? "\uFEFF" : "") + text;
        const imports = code.includes(importSource);

        // As in the build: with types, a file may receive reactive values through props without importing
        // anything, so every TypeScript file is checked. Without types, only files that import the sugar
        const typed = options.types !== false && isTypeScript(filename);
        if (!typed && !imports) return;
        let types: TypeService | false = false;
        if (typed) {
          const found = typesFor(filename, code);
          // Without the types, valid code can be reported (a prop that the types make reactive).
          // Reporting nothing is better than reporting what the build would accept
          if (!found) return;
          types = found;
        }

        try {
          transformSync(code, {
            filename,
            babelrc: false,
            configFile: false,
            code: false,
            plugins: [[babelPlugin, { importSource, types }]],
          });
        } catch (error) {
          const top = { line: 1, column: 0 };
          const { diagnostic } = error as { diagnostic?: Diagnostic };
          if (diagnostic && diagnostic.cause === undefined) {
            const start = diagnostic.loc?.start ?? top;
            const end = diagnostic.loc?.end ?? start;
            context.report({
              loc: {
                start: { line: start.line, column: start.column },
                end: { line: end.line, column: end.column },
              },
              message: diagnostic.message,
            });
            return;
          }
          // The type checker runs in a process of its own. oxlint reserves much virtual memory per thread,
          // and Linux can then refuse to start any process (ENOMEM). Then no file is checked, so it is
          // reported once, whether the file uses the sugar or not
          const { syscall } = (diagnostic?.cause ?? {}) as { syscall?: unknown };
          if (typeof syscall === "string" && syscall.startsWith("spawn")) {
            if (startFailureReported) return;
            startFailureReported = true;
            context.report({
              loc: { start: top, end: top },
              message:
                `The type checker could not be started (${diagnostic!.message}), so no file is checked. ` +
                "With oxlint, run it with fewer threads (`--threads 1`).",
            });
            return;
          }
          // The rest is not about the code: the type checker could not be asked (no tsconfig.json includes
          // the file, no TypeScript 7), or the file does not parse, which the parser of the linter reports.
          // It is reported only for a file that uses the sugar, whose build fails the same way
          if (!imports || !(error instanceof Error)) return;
          if ((error as { code?: unknown }).code === "BABEL_PARSE_ERROR") return;
          context.report({
            loc: { start: top, end: top },
            message: diagnostic?.message ?? firstLine(error.message),
          });
        }
      },
    };
  },
};

/**
 * The ESLint plugin of react-preprocessor. It also works as a JS plugin of oxlint.
 *
 * The rule `valid-sugar` runs the transform of the build on the file and reports what it rejects,
 * at the code it points at.
 */
const plugin: Plugin = {
  meta: { name: "react-preprocessor" },
  rules: { "valid-sugar": validSugar },
  configs: {} as Plugin["configs"],
};
plugin.configs.recommended = {
  plugins: { "react-preprocessor": plugin },
  rules: { "react-preprocessor/valid-sugar": "error" },
};

export default plugin;
