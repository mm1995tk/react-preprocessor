// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import loader from "../src/loader.ts";

const run = (resourcePath: string, source: string): Promise<string> =>
  new Promise((resolve, reject) => {
    loader.call(
      {
        resourcePath,
        getOptions: () => ({}),
        async: () => (error, code) => (error ? reject(error) : resolve(code ?? "")),
      },
      source,
    );
  });

test("the webpack loader lowers the sugar and keeps types and JSX", async () => {
  const file = join(import.meta.dirname, "fixtures", "counter", "input.tsx");
  const output = await run(file, readFileSync(file, "utf8"));
  expect(output).toContain("const [cnt, setCnt] = useState<number>(0);");
  expect(output).toContain("<button onClick={() => setCnt(n => n + 1)}>inc</button>");
});

test("the webpack loader leaves files in node_modules untouched", async () => {
  const source = `import { reactive } from "react-preprocessor";\nconst x = reactive.new(0);\n`;
  expect(await run("/app/node_modules/pkg/index.tsx", source)).toBe(source);
});
