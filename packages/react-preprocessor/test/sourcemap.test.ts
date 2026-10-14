// @vitest-environment node
import { readFileSync } from "node:fs";
import { SourceMap } from "node:module";
import { join } from "node:path";
import { transformSync } from "@babel/core";
import { expect, test } from "vitest";
import plugin from "../src/babel.ts";

const file = join(import.meta.dirname, "fixtures", "counter", "input.tsx");
const input = readFileSync(file, "utf8");

const lineOf = (code: string, text: string): number => {
  const index = code.split("\n").findIndex((line) => line.includes(text));
  if (index < 0) throw new Error(`not found: ${text}`);
  return index;
};

test("the source map points each lowered line back to the sugar it came from", () => {
  const result = transformSync(input, {
    filename: file,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    plugins: [plugin],
  });
  const output = result!.code!;
  const map = new SourceMap(result!.map as unknown as ConstructorParameters<typeof SourceMap>[0]);

  const cases: [generated: string, original: string][] = [
    ["useState<number>(0)", "reactive.new(0)"],
    ["cnt * 2", "cnt.derive((n) => n * 2)"],
    ["setCnt(n => n + 1)", "cnt.update((n) => n + 1)"],
    ["now: {cnt}", "now: {cnt}"],
  ];
  for (const [generated, original] of cases) {
    const line = lineOf(output, generated);
    const column = output.split("\n")[line]!.indexOf(generated);
    const entry = map.findEntry(line, column);
    const originalLine = "originalLine" in entry ? entry.originalLine : -1;
    expect({ generated, originalLine }).toEqual({
      generated,
      originalLine: lineOf(input, original),
    });
  }
});
