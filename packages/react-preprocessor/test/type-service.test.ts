// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { transformSync } from "@babel/core";
import { expect, test } from "vitest";
import babelPlugin from "../src/babel.ts";
import { createTypeService } from "../src/types.ts";
import type { TypeService } from "../src/types.ts";

test("after invalidate, the types are read again from disk", () => {
  // Inside test/, so that the tsconfig.json of the package includes the files
  const dir = mkdtempSync(join(import.meta.dirname, "type-service-"));
  const service = createTypeService();
  try {
    const props = join(dir, "props.ts");
    const use = join(dir, "Use.tsx");
    const rejects = (types: TypeService): boolean => {
      try {
        transformSync(readFileSync(use, "utf8"), {
          filename: use,
          babelrc: false,
          configFile: false,
          code: false,
          plugins: [[babelPlugin, { types }]],
        });
        return false;
      } catch {
        return true;
      }
    };
    writeFileSync(
      props,
      'import type { Reactive } from "react-preprocessor";\nexport type P = { n: Reactive<number> };\n',
    );
    writeFileSync(
      use,
      'import type { P } from "./props.ts";\n' +
        "export const Use = ({ n }: P) => {\n  console.log(n);\n  return <>{n}</>;\n};\n",
    );
    // `n` is reactive, so it cannot be passed to console.log
    expect(rejects(service)).toBe(true);

    writeFileSync(props, "export type P = { n: number };\n");
    service.invalidate();
    expect(rejects(service)).toBe(false);
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
