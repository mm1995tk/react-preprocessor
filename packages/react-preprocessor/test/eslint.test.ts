// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Linter } from "eslint";
import { defineConfig } from "eslint/config";
import { afterEach, describe, expect, test } from "vitest";
import plugin from "../src/eslint.ts";
import type { Options } from "../src/eslint.ts";

const root = join(import.meta.dirname, "..");
const typed = join(import.meta.dirname, "typed");

// The rule reads the text, not the tree, so any parser does. This one only gives ESLint an empty program,
// so that TypeScript can be linted without a TypeScript parser
const parser = {
  parse: (code: string) => {
    const lines = code.split("\n");
    return {
      type: "Program",
      body: [],
      sourceType: "module",
      range: [0, code.length],
      loc: {
        start: { line: 1, column: 0 },
        end: { line: lines.length, column: lines.at(-1)!.length },
      },
      tokens: [],
      comments: [],
    };
  },
};

type Message = { line: number; column: number; endLine: number | undefined; message: string };

const lint = (code: string, filename: string, options: Options = {}): Message[] =>
  // The root of the file system as the base path, so that a file outside the package is linted too
  new Linter({ cwd: "/" })
    .verify(
      code,
      [
        {
          files: ["**/*.{ts,tsx}"],
          languageOptions: { parser },
          plugins: { "react-preprocessor": plugin },
          rules: { "react-preprocessor/valid-sugar": ["error", options] },
        },
      ],
      { filename },
    )
    .map(({ line, column, endLine, message }) => ({ line, column, endLine, message }));

const component = (body: string): string => `
import { reactive } from "react-preprocessor";
export const C = () => {
  const cnt = reactive.new(0);
  ${body}
  return <>{cnt}</>;
};
`;

describe("without types", () => {
  const file = join(root, "test", "not-on-disk.tsx");

  test("a misuse is reported at the code the build points at", () => {
    // ESLint counts columns from 1, Babel from 0
    expect(lint(component("if (cnt) {}"), file, { types: false })).toEqual([
      {
        line: 5,
        column: 7,
        endLine: 5,
        message: expect.stringMatching(/^A reactive value cannot be used as a plain value here/),
      },
    ]);
  });

  test("valid code is not reported", () => {
    expect(lint(component("const d = cnt.derive((n) => n * 2);"), file, { types: false })).toEqual(
      [],
    );
  });

  test("a file that does not import the sugar is skipped", () => {
    expect(lint("if (cnt) {}\n", file, { types: false })).toEqual([]);
  });

  test("the import source is an option", () => {
    const code = component("if (cnt) {}").replace('"react-preprocessor"', '"sugar"');
    expect(lint(code, file, { types: false })).toEqual([]);
    expect(lint(code, file, { types: false, importSource: "sugar" })).toHaveLength(1);
  });

  test("a file that does not parse is left to the parser", () => {
    expect(lint(component("const = ;"), file, { types: false })).toEqual([]);
  });
});

const read = (name: string): [code: string, file: string] => {
  const file = join(typed, name);
  return [readFileSync(file, "utf8"), file];
};

const write = (file: string, code: string): string => (writeFileSync(file, code), code);

describe("with types", () => {
  test("a misuse that only the types show is reported", () => {
    const [code, file] = read("Leak.tsx");
    expect(lint(code, file)).toEqual([
      expect.objectContaining({
        line: 6,
        column: 15,
        message: expect.stringMatching(/^A reactive value cannot be used as a plain value here/),
      }),
    ]);
  });

  test("props that the types make reactive are not reported", () => {
    const [code, file] = read("Item.tsx");
    expect(lint(code, file)).toEqual([]);
    // Without the types, the same file would be reported
    expect(lint(code, file, { types: false })).not.toEqual([]);
  });

  test("a file with unsaved changes is skipped, not reported from a guess", () => {
    const [code, file] = read("Leak.tsx");
    expect(lint(`${code}\n// edited\n`, file)).toEqual([]);
  });

  describe("a change saved in another file", () => {
    let dir: string | undefined;
    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    });

    test.each([
      ["was linted before", true],
      ["was only read as a dependency", false],
    ])("is seen once the changed file, which %s, is linted", (_, lintedBefore) => {
      // Inside test/, so that the tsconfig.json of the package includes the files
      dir = mkdtempSync(join(root, "test", "eslint-saved-"));
      const types = join(dir, "props.ts");
      const user = join(dir, "Use.tsx");

      const reactive = write(
        types,
        'import type { Reactive } from "react-preprocessor";\nexport type P = { n: Reactive<number> };\n',
      );
      const use = write(
        user,
        'import type { P } from "./props.ts";\n' +
          "export const Use = ({ n }: P) => {\n  console.log(n);\n  return <>{n}</>;\n};\n",
      );
      if (lintedBefore) lint(reactive, types);
      expect(lint(use, user)).toHaveLength(1);

      // In an editor, saving the types lints them
      const plain = write(types, "export type P = { n: number };\n");
      expect(lint(plain, types)).toEqual([]);
      expect(lint(use, user)).toEqual([]);
    });
  });
});

test("the recommended config turns the rule on", () => {
  // Type-checked as well: the plugin is accepted where ESLint's types expect one
  expect(defineConfig([plugin.configs.recommended])).toEqual([plugin.configs.recommended]);
  expect(plugin.configs.recommended).toEqual({
    plugins: { "react-preprocessor": plugin },
    rules: { "react-preprocessor/valid-sugar": "error" },
  });
});

test("the rule works as a JS plugin of oxlint", () => {
  const dir = mkdtempSync(join(root, "test", "eslint-oxlint-"));
  try {
    const config = join(dir, ".oxlintrc.json");
    writeFileSync(
      config,
      JSON.stringify({
        // The source, not the build, so the test does not depend on `pnpm build`. Loading a .ts file needs
        // Node's type stripping (22.18 and later; the dev shell has Node 26)
        jsPlugins: [join(root, "src", "eslint.ts")],
        rules: { "react-preprocessor/valid-sugar": "error" },
      }),
    );
    const oxlint = join(root, "..", "..", "node_modules", ".bin", "oxlint");
    let output = "";
    try {
      // One thread: with more, Linux can refuse to start the type checker (see src/eslint.ts).
      // The format is given, because on GitHub Actions oxlint picks its own
      execFileSync(
        oxlint,
        [
          "--threads",
          "1",
          "--format",
          "json",
          "-c",
          config,
          "test/typed/Leak.tsx",
          "test/typed/Item.tsx",
        ],
        { cwd: root, encoding: "utf8" },
      );
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }
    type Diagnostic = {
      code: string;
      message: string;
      filename: string;
      labels: { span: { line: number; column: number } }[];
    };
    const { diagnostics } = JSON.parse(output) as { diagnostics: Diagnostic[] };
    expect(
      diagnostics.map(({ code, message, filename, labels }) => ({
        code,
        message,
        filename,
        at: labels.map(({ span }) => [span.line, span.column]),
      })),
    ).toEqual([
      {
        code: "react-preprocessor(valid-sugar)",
        message: expect.stringMatching(/^A reactive value cannot be used as a plain value here/),
        filename: "test/typed/Leak.tsx",
        at: [[6, 15]],
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
