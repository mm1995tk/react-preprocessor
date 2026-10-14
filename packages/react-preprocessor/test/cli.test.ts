// @vitest-environment node
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { transformSync } from "@babel/core";
import babelPlugin from "../src/babel.ts";
import { eject, run } from "../src/commands.ts";
import type { TypeService } from "../src/types.ts";

const root = join(import.meta.dirname, "..");
const fixtures = join(import.meta.dirname, "fixtures");
const typed = join(import.meta.dirname, "typed");

const cli = (...argv: string[]): { code: number; stdout: string; stderr: string } => {
  let stdout = "";
  let stderr = "";
  const code = run(argv, {
    stdout: (text) => void (stdout += text),
    stderr: (text) => void (stderr += text),
  });
  return { code, stdout, stderr };
};

const tsconfig = (options: Record<string, unknown>): string =>
  JSON.stringify({
    compilerOptions: {
      target: "es2023",
      module: "nodenext",
      moduleResolution: "nodenext",
      lib: ["es2023", "dom"],
      jsx: "react-jsx",
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      verbatimModuleSyntax: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      skipLibCheck: true,
      ...options,
    },
    include: ["src"],
  });

/** Every file under `dir`, with its content */
const snapshot = (dir: string): Record<string, string> =>
  Object.fromEntries(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      .toSorted()
      .map((file) => [file.slice(dir.length + 1), readFileSync(file, "utf8")]),
  );

/** The manual step eject asks for: the tsconfig no longer knows react-preprocessor. Returns the output of `tsc` */
const typecheck = (dir: string): string => {
  writeFileSync(join(dir, "tsconfig.json"), tsconfig({}));
  const tsc = join(
    dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
    "bin",
    "tsc",
  );
  try {
    execFileSync(process.execPath, [tsc, "--noEmit"], { cwd: dir, encoding: "utf8" });
    return "";
  } catch (error) {
    return (error as { stdout: string }).stdout;
  }
};

/** What the plugin leaves in the metadata of a file */
const lowered = (file: string): unknown =>
  transformSync(readFileSync(file, "utf8"), {
    filename: file,
    babelrc: false,
    configFile: false,
    plugins: [[babelPlugin, { types: false }]],
  })?.metadata;

describe("print", () => {
  for (const name of readdirSync(fixtures)) {
    test(`fixture ${name}`, () => {
      const result = cli("print", join(fixtures, name, "input.tsx"));
      expect(result.stdout).toBe(readFileSync(join(fixtures, name, "output.tsx"), "utf8"));
      expect(result).toMatchObject({ code: 0, stderr: "" });
    });
  }

  test("a file with no sugar is printed as it is", () => {
    const file = join(typed, "types.ts");
    expect(cli("print", file)).toEqual({ code: 0, stdout: readFileSync(file, "utf8"), stderr: "" });
  });

  test("--no-types does not ask the type checker", () => {
    // The props type lives in another file. Without types nothing in this file is known to be reactive
    const file = join(typed, "Item.tsx");
    expect(cli("print", file).stdout).toContain("value: todo,");
    expect(cli("print", file, "--no-types").stdout).not.toContain("value: todo,");
  });

  test("an error of the transform goes to standard error with a code frame, and the exit code is 1", () => {
    const result = cli("print", join(typed, "Optional.tsx"));
    expect(result).toMatchObject({ code: 1, stdout: "" });
    expect(result.stderr).toContain("The reactive value `value` cannot be optional.");
    expect(result.stderr).toContain("> 3 | export const Optional");
  });

  test("a missing file and a wrong command line fail", () => {
    expect(cli("print", join(typed, "Missing.tsx")).code).toBe(1);
    expect(cli("print").code).toBe(1);
    expect(cli("print", "a.tsx", "--unknown").code).toBe(1);
    expect(cli("unknown").code).toBe(1);
  });

  test("the options of eject are rejected: print writes nothing", () => {
    const file = join(fixtures, "counter", "input.tsx");
    for (const option of [["--write"], ["--types-file", "types.ts"]]) {
      const result = cli("print", file, ...option);
      expect(result).toMatchObject({ code: 1, stdout: "" });
      expect(result.stderr).toContain("--write and --types-file belong to eject");
    }
  });

  test("--import-source names the module the sugar is imported from", () => {
    const dir = temporaryDirectory();
    const file = join(dir, "Counter.tsx");
    const source = readFileSync(join(fixtures, "counter", "input.tsx"), "utf8");
    writeFileSync(file, source.replace(`"react-preprocessor"`, `"my-sugar"`));
    // Without the option the file does not import the sugar, so it is printed as it is
    expect(cli("print", file, "--no-types").stdout).toContain("reactive.new(0)");
    const result = cli("print", file, "--no-types", "--import-source", "my-sugar");
    expect(result.stdout).toContain("const [cnt, setCnt] = useState<number>(0);");
  });

  test("the plugin marks the files it rewrites, so a file with no sugar is transformed once", () => {
    expect(lowered(join(fixtures, "counter", "input.tsx"))).toMatchObject({
      reactPreprocessor: { lowered: true },
    });
    expect(lowered(join(typed, "Leak.tsx"))).not.toHaveProperty("reactPreprocessor");
  });
});

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const temporaryDirectory = (): string => {
  // The real path: on some systems the temporary directory is itself a symbolic link
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "react-preprocessor-eject-")));
  temporary.push(dir);
  return dir;
};

/** A project in a temporary directory, set up the way the README describes. `files` are relative to `test` */
const project = (files: string[]): string => {
  const dir = temporaryDirectory();
  for (const file of files) {
    mkdirSync(dirname(join(dir, "src", file)), { recursive: true });
    copyFileSync(join(import.meta.dirname, file), join(dir, "src", file));
  }
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  // `react` and `jotai` come from this package. The sugar is reached through `paths`, as in this package's tsconfig
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const source = (file: string): string[] => [join(root, "src", file)];
  writeFileSync(
    join(dir, "tsconfig.json"),
    tsconfig({
      jsxImportSource: "react-preprocessor",
      paths: {
        "react-preprocessor": source("index.ts"),
        "react-preprocessor/jotai": source("jotai.ts"),
        "react-preprocessor/jsx-runtime": source("jsx-runtime.ts"),
        "react-preprocessor/jsx-dev-runtime": source("jsx-dev-runtime.ts"),
      },
    }),
  );
  return dir;
};

/** Writes source files into the `src` of a project */
const add = (dir: string, sources: Record<string, string>): void => {
  for (const [file, content] of Object.entries(sources)) {
    mkdirSync(dirname(join(dir, "src", file)), { recursive: true });
    writeFileSync(join(dir, "src", file), content);
  }
};

describe("eject", () => {
  // Props (inline and declared in another file), custom hooks, Context, `reactive.from`, and Jotai
  const files = [
    "eject/App.tsx",
    "eject/Hooks.tsx",
    "eject/hooks.ts",
    "typed/Atoms.tsx",
    "typed/Item.tsx",
    "typed/types.ts",
  ];

  test("without --write it lists the files and writes nothing", () => {
    const dir = project(files);
    const before = snapshot(join(dir, "src"));
    const result = cli("eject", join(dir, "src"));
    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(result.stdout).toContain("Would rewrite 6 files:");
    for (const file of [...files, "reactive-types.ts", "reactive-jotai.ts"]) {
      expect(result.stdout).toContain(join("src", file));
    }
    expect(result.stdout).toContain("Nothing was written.");
    expect(snapshot(join(dir, "src"))).toEqual(before);
  });

  test("the ejected project passes tsc without react-preprocessor", () => {
    const dir = project(files);
    const result = cli("eject", join(dir, "src"), "--write");
    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(result.stdout).toContain("Rewrote 6 files:");
    expect(result.stdout).toContain("Run your formatter.");
    expect(result.stdout).toContain(`Remove \`"jsxImportSource": "react-preprocessor"\``);

    const after = snapshot(join(dir, "src"));
    expect(Object.keys(after)).toEqual(
      [...files, "reactive-jotai.ts", "reactive-types.ts"].toSorted(),
    );
    for (const code of Object.values(after)) expect(code).not.toMatch(/from "react-preprocessor/);
    // The specifier is relative to each file, with the extension the project's imports have
    expect(after["typed/types.ts"]).toContain(
      `import type { Derived, Reactive } from "../reactive-types.ts";`,
    );
    expect(after["typed/Atoms.tsx"]).toContain(`from "../reactive-jotai.ts";`);
    expect(after["reactive-jotai.ts"]).toContain(`from "./reactive-types.ts";`);
    // A file the preprocessor has nothing to rewrite in keeps its formatting
    expect(after["typed/types.ts"]).toBe(
      readFileSync(join(typed, "types.ts"), "utf8").replace(
        `"react-preprocessor"`,
        `"../reactive-types.ts"`,
      ),
    );

    // What typed a parameter in the source still does. Under `strict` it would be an implicit `any` otherwise
    const flat = (file: string): string => after[file]!.replace(/\s+/g, " ");
    expect(flat("eject/hooks.ts")).toContain("({ value: source }: Derived<number>)");
    expect(flat("eject/hooks.ts")).toContain("update: setTarget }: Reactive<number>)");
    expect(flat("eject/Hooks.tsx")).toContain(
      "setN: (f: (old: typeof n) => typeof n) => void = f =>",
    );
    expect(typecheck(dir)).toBe("");

    // Nothing is left to do the second time
    expect(cli("eject", join(dir, "src"), "--write").stdout).toContain("Nothing to eject");
    expect(snapshot(join(dir, "src"))).toEqual(after);
  });

  test("--types-file chooses where the types go, and the project's import style is followed", () => {
    const dir = project(["eject/hooks.ts"]);
    // The only relative import of the project has no extension
    writeFileSync(join(dir, "src", "index.ts"), `export { useToggle } from "./eject/hooks";\n`);
    const typesFile = join(dir, "src", "lib", "plain.ts");
    expect(cli("eject", join(dir, "src"), "--write", "--types-file", typesFile).code).toBe(0);
    const after = snapshot(join(dir, "src"));
    expect(Object.keys(after)).toEqual(["eject/hooks.ts", "index.ts", "lib/plain.ts"]);
    expect(after["eject/hooks.ts"]).toContain(
      `import type { Derived, Reactive } from "../lib/plain";`,
    );
  });

  test("one failing file stops everything: the errors are reported and nothing is written", () => {
    const dir = project([...files, "typed/Optional.tsx"]);
    const before = snapshot(join(dir, "src"));
    const result = cli("eject", join(dir, "src"), "--write");
    expect(result).toMatchObject({ code: 1, stdout: "" });
    expect(result.stderr).toContain("The reactive value `value` cannot be optional.");
    expect(result.stderr).toContain("eject failed with 1 error. No file was written.");
    expect(snapshot(join(dir, "src"))).toEqual(before);
  });

  test("an existing file is not overwritten by the generated types", () => {
    const dir = project(["eject/hooks.ts"]);
    writeFileSync(join(dir, "src", "reactive-types.ts"), "export type Reactive<T> = T;\n");
    const before = snapshot(join(dir, "src"));
    const result = cli("eject", join(dir, "src"), "--write");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("already exists with other content");
    expect(snapshot(join(dir, "src"))).toEqual(before);
  });

  const typeImport = `import type { Reactive } from "react-preprocessor";\nexport type Flag = Reactive<boolean>;\n`;

  test(".mts and .cts files are ejected, their declaration files are not", () => {
    const dir = project([]);
    add(dir, { "a.mts": typeImport, "b.cts": typeImport, "c.d.mts": typeImport });
    expect(cli("eject", join(dir, "src"), "--write")).toMatchObject({ code: 0, stderr: "" });
    const after = snapshot(join(dir, "src"));
    for (const file of ["a.mts", "b.cts"]) {
      expect(after[file]).toBe(typeImport.replace("react-preprocessor", "./reactive-types.ts"));
    }
    expect(after["c.d.mts"]).toBe(typeImport);
    // A file given by name follows the same rule
    expect(cli("eject", join(dir, "src", "c.d.mts")).code).toBe(1);
  });

  test("a dynamic import and an import type of the package are rewritten too", () => {
    const dir = project([]);
    add(dir, {
      "lazy.ts": [
        `export const load = async () => (await import("react-preprocessor/jotai")).useReactiveAtom;`,
        `export type Flag = import("react-preprocessor").Reactive<boolean>;`,
        "",
      ].join("\n"),
    });
    expect(cli("eject", join(dir, "src"), "--write")).toMatchObject({ code: 0, stderr: "" });
    const after = snapshot(join(dir, "src"));
    expect(after["lazy.ts"]).toBe(
      [
        `export const load = async () => (await import("./reactive-jotai.ts")).useReactiveAtom;`,
        `export type Flag = import("./reactive-types.ts").Reactive<boolean>;`,
        "",
      ].join("\n"),
    );
    expect(Object.keys(after)).toEqual(["lazy.ts", "reactive-jotai.ts", "reactive-types.ts"]);
    expect(typecheck(dir)).toBe("");
  });

  test("a reference to the package that has no plain counterpart is an error, wherever it is", () => {
    const sources = {
      "dynamic.ts": `export const load = () => import("react-preprocessor");\n`,
      "required.cts": `export const sugar = require("react-preprocessor");\n`,
      "query.ts": `export type Node = import("react-preprocessor").ReactiveNode;\n`,
      "static.ts": `export type { ReactiveNode } from "react-preprocessor";\n`,
    };
    const dir = project([]);
    add(dir, sources);
    const before = snapshot(join(dir, "src"));
    const result = cli("eject", join(dir, "src"), "--write");
    expect(result).toMatchObject({ code: 1, stdout: "" });
    for (const file of Object.keys(sources)) {
      expect(result.stderr).toContain(`${join(dir, "src", file)}:1: eject cannot replace`);
    }
    expect(result.stderr).toContain("eject failed with 4 errors. No file was written.");
    expect(snapshot(join(dir, "src"))).toEqual(before);
  });

  test("an error of the type checker itself is reported once, not once per file", () => {
    const dir = project(files);
    const before = snapshot(join(dir, "src"));
    let queries = 0;
    const broken: TypeService = {
      query() {
        queries += 1;
        throw new Error("The type-aware transform needs TypeScript 7 or later.");
      },
      invalidate() {},
      close() {},
    };
    let stderr = "";
    const code = eject(
      [join(dir, "src")],
      { write: true, typesFile: undefined, types: broken, importSource: "react-preprocessor" },
      { stdout: () => {}, stderr: (text) => void (stderr += text) },
    );
    expect(code).toBe(1);
    expect(queries).toBe(1);
    expect(stderr.match(/needs TypeScript 7 or later/g)).toHaveLength(1);
    expect(stderr).toContain("pass --no-types");
    expect(stderr).toContain("eject failed with 1 error. No file was written.");
    expect(snapshot(join(dir, "src"))).toEqual(before);
  });

  test("--import-source ejects a project that imports the sugar from another module", () => {
    const dir = project([]);
    add(dir, {
      "Counter.tsx": readFileSync(join(fixtures, "counter", "input.tsx"), "utf8").replace(
        `"react-preprocessor"`,
        `"my-sugar"`,
      ),
      "lazy.ts": `export const load = () => import("my-sugar/jotai");\n`,
    });
    // The module is not installed in this project, so types are off
    const args = ["eject", join(dir, "src"), "--write", "--no-types"];
    expect(cli(...args).stdout).toContain("Nothing to eject: no file uses react-preprocessor.");
    expect(cli(...args, "--import-source", "my-sugar")).toMatchObject({ code: 0, stderr: "" });
    const after = snapshot(join(dir, "src"));
    expect(after["Counter.tsx"]).toContain(`import type { Reactive } from "./reactive-types.ts";`);
    expect(after["Counter.tsx"]).toContain("const [cnt, setCnt] = useState<number>(0);");
    expect(after["lazy.ts"]).toContain(`import("./reactive-jotai.ts")`);
  });

  test("--types-file must be a .ts file: the imports are written from its name", () => {
    const dir = project(["eject/hooks.ts"]);
    const before = snapshot(join(dir, "src"));
    for (const name of ["plain", "plain.d.ts", "plain.tsx", "plain.js"]) {
      const result = cli("eject", join(dir, "src"), "--write", "--types-file", join(dir, name));
      expect(result).toMatchObject({ code: 1, stdout: "" });
      expect(result.stderr).toContain("--types-file must be a .ts file");
    }
    expect(snapshot(join(dir, "src"))).toEqual(before);
    expect(readdirSync(dir).toSorted()).toEqual([
      "node_modules",
      "package.json",
      "src",
      "tsconfig.json",
    ]);
  });

  test("symbolic links to files and directories are followed", () => {
    const dir = project(["eject/hooks.ts"]);
    // The sources live outside `src`, and are reached through links only
    mkdirSync(join(dir, "shared", "nested"), { recursive: true });
    writeFileSync(join(dir, "shared", "nested", "flag.ts"), typeImport);
    writeFileSync(join(dir, "shared", "single.ts"), typeImport);
    symlinkSync(join(dir, "shared", "nested"), join(dir, "src", "linked"));
    symlinkSync(join(dir, "shared", "single.ts"), join(dir, "src", "single.ts"));
    // A link back to a parent, and a link to nothing
    symlinkSync(join(dir, "src"), join(dir, "src", "eject", "loop"));
    symlinkSync(join(dir, "missing.ts"), join(dir, "src", "broken.ts"));

    const result = cli("eject", join(dir, "src"), "--write");
    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(result.stdout).toContain("Rewrote 3 files:");
    // The import is relative to where the file really is: that is where TypeScript resolves it from
    expect(readFileSync(join(dir, "shared", "nested", "flag.ts"), "utf8")).toContain(
      `from "../../src/reactive-types.ts";`,
    );
    expect(readFileSync(join(dir, "shared", "single.ts"), "utf8")).toContain(
      `from "../src/reactive-types.ts";`,
    );
    expect(readFileSync(join(dir, "src", "eject", "hooks.ts"), "utf8")).toContain(
      `from "../reactive-types.ts";`,
    );
  });
});
