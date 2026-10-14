// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createTypeService } from "../src/types.ts";
import type { Kind, TypeService } from "../src/types.ts";

const temporary: string[] = [];
const services: TypeService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.close();
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A directory inside test/, so that the tsconfig.json of the package includes the files */
const directory = (): string => {
  const dir = mkdtempSync(join(import.meta.dirname, "types-"));
  temporary.push(dir);
  return dir;
};

const service = (): TypeService => {
  const created = createTypeService();
  services.push(created);
  return created;
};

/** The kind of the variable `x` in `file`, whose content on disk is `code` */
const kindOfX = (types: TypeService, file: string, code: string): Kind | null => {
  const position = code.indexOf("const x") + "const ".length;
  return types.query(file, code, [{ position, of: "value" }])[0]!.kind;
};

const hook = `import type { Reactive } from "react-preprocessor";\nexport const useX = (): Reactive<number> => null!;\n`;
const component = `import { useX } from "./hook.ts";\nexport const C = () => {\n  const x = useX();\n  return <p>{x}</p>;\n};\n`;

test("an edit of a file that was already queried is seen without `invalidate`", () => {
  const dir = directory();
  const file = join(dir, "C.tsx");
  writeFileSync(join(dir, "hook.ts"), hook);
  writeFileSync(file, component);
  const types = service();
  expect(kindOfX(types, file, component)).toBe("Reactive");

  // Lines added above shift every position. Nothing calls `invalidate`, as with the webpack loader
  const edited = `// a comment\n// another one\n${component}`;
  writeFileSync(file, edited);
  expect(kindOfX(types, file, edited)).toBe("Reactive");
}, 60_000);

test("a queried file that was deleted does not break the next query", () => {
  const dir = directory();
  const file = join(dir, "C.tsx");
  const other = join(dir, "D.tsx");
  writeFileSync(join(dir, "hook.ts"), hook);
  writeFileSync(file, component);
  writeFileSync(other, component);
  const types = service();
  expect(kindOfX(types, file, component)).toBe("Reactive");
  expect(kindOfX(types, other, component)).toBe("Reactive");

  rmSync(other);
  types.invalidate();
  expect(kindOfX(types, file, component)).toBe("Reactive");
}, 60_000);
