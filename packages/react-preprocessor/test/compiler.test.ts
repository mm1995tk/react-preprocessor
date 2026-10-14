// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transformSync } from "@babel/core";
import { expect, test } from "vitest";
import plugin from "../src/babel.ts";

const fixtures = join(import.meta.dirname, "fixtures");

// In a single Babel run, list react-preprocessor first and then the React Compiler
const compile = (code: string, filename: string): string => {
  const result = transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [plugin, "babel-plugin-react-compiler"],
  });
  return `${result?.code ?? ""}\n`;
};

for (const name of ["counter", "derive", "do", "todo", "props", "jsx", "effect", "narrow"]) {
  test(`React Compiler memoizes the lowered ${name}`, async () => {
    const file = join(fixtures, name, "input.tsx");
    const output = compile(readFileSync(file, "utf8"), file);
    expect(output).toContain(`from "react/compiler-runtime"`);
    await expect(output).toMatchFileSnapshot(join(fixtures, name, "compiled.tsx"));
  });
}
