# react-preprocessor

See in the types which values re-render your component.

React state is a plain value: the `count` from `useState` looks like any other number, so nothing tells you
it belongs in a dependency array or that a closure may hold an old copy of it. With react-preprocessor, state is
`Reactive<T>` and what is computed from it is `Derived<T>`. The preprocessor writes the setters, the immutable
updates, and the dependency arrays, and the output is plain React with no runtime library.

> **Status: experimental.** The API is still changing.

[Website](https://mm1995tk.github.io/react-preprocessor/): edit the examples in the browser and see the plain React they become.

## At a glance

```tsx
import { $, reactive } from "react-preprocessor";

type Todo = { id: number; title: string; done: boolean };

export const Todos = ({ owner }: { owner: string }) => {
  const todos = reactive.new<Todo[]>([]); // Reactive<Todo[]>
  const left = todos.derive((list) => list.filter((t) => !t.done).length); // Derived<number>

  reactive.effect(() => {
    document.title = `${owner}: ${$(left)} left`;
  });

  return (
    <ul>
      {todos.each(
        (todo) => todo.id,
        (todo) => (
          <li onClick={() => todo.focus("done").update((done) => !done)}>
            {todo.derive((t) => t.title)}
          </li>
        ),
      )}
    </ul>
  );
};
```

is rewritten at build time into plain React:

```tsx
import { useState, useEffect } from "react";

type Todo = { id: number; title: string; done: boolean };

export const Todos = ({ owner }: { owner: string }) => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const left = todos.filter((t) => !t.done).length;
  useEffect(() => {
    document.title = `${owner}: ${left} left`;
  }, [owner, left]);
  return (
    <ul>
      {todos.map((todo) => (
        <li
          onClick={() =>
            setTodos((prev) =>
              prev.map((item) => (item.id === todo.id ? { ...item, done: !item.done } : item)),
            )
          }
          key={todo.id}
        >
          {todo.title}
        </li>
      ))}
    </ul>
  );
};
```

- `todo.focus("done").update(...)` became the nested immutable update. The item is found by key, so the update hits
  the right item even if the list was reordered in the same batch.
- The dependency array `[owner, left]` was written for you, from what the effect reads.
- `todos.each` gave each item its own reactive value, and the `key`.

Try it on one file: files without the sugar are left as they are. To leave, `react-preprocessor eject` rewrites
the project to the plain React above (see [CLI](#cli)).

## Why

In Vue, Solid, and Angular, state has a type of its own: `Ref<T>`, `Accessor<T>`, `Signal<T>`. In React it is
just `T`, and the questions that follow are left to you and to lint rules: which values re-render the component,
and which ones an effect must depend on so that it never sees an old value. Here the type answers them.

- A reactive value is marked by its type: `Reactive<T>` (writable) or `Derived<T>` (read-only).
- There is no `get`. You cannot pull the value out; you derive from it with `derive` / `reactive.derive`, or use it in JSX.
  A reactive value used as a plain value is a build error, and the dependency array of an effect is written from
  what it reads.
- Updates are `update(old => next)`, a pure function from the old value to the new one. `set(next)` is the shortcut for a constant.
  Nested state is updated through lenses (`focus`, `each`), and unions are narrowed with `when` and `match`
  without losing the ability to update.
- JSX is extended: a reactive value goes straight into `{...}`, as a child or as an attribute.
- The source is valid TypeScript. Type checkers, editors, and formatters work unchanged.
- `Reactive<T>` exists only at compile time. There is no runtime library in the output.

Performance is not a goal. Memoization is left to React and the React Compiler,
which runs after this preprocessor.

```
React + sugar (.tsx)
  ↓ react-preprocessor
plain React (.tsx)
  ↓ React Compiler
optimized React
```

## API

| Sugar                                    | Meaning                                       | Rewritten to                                                     |
| ---------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| `reactive.new(x)`                        | create a reactive value                       | `useState(x)`                                                    |
| `r.update(f)`                            | update with a pure function                   | `setR(f)`                                                        |
| `r.set(x)`                               | replace the value; `x` is read at the call    | `setR(() => x)`                                                  |
| `r.derive(f)`                            | derive a value                                | `f(r)`                                                           |
| `reactive.handler((e) => ... $(r) ...)`  | an event handler that reads current values    | the function, with `$(r)` replaced by `r`                        |
| `reactive.of(x)`                         | treat a plain value as reactive               | `x`                                                              |
| `reactive.from(x, update)`               | treat a value and an updater as reactive      | `x`; `r.update(f)` becomes `update(f)`                           |
| `r.focus("key")`                         | lens: a writable view of one property         | `r.key`; updates are written back to `r`                         |
| `r.each(key, item => ...)`               | render a list, one reactive value per item    | `r.map(item => ...)` with `key`; updates are written back to `r` |
| `r.when(guard, { narrowed, rest? })`     | narrow with a type guard                      | `guard(r) ? narrowed(r) : rest(r)`; updates re-check the guard   |
| `r.match("key", { a: ..., b: ... })`     | narrow a discriminated union                  | `r.key === "a" ? ... : r.key === "b" ? ... : undefined`          |
| `reactive.derive(() => ... $(r) ...)`    | derive a value; `$(r)` reads `r` in the block | the block, with `$(r)` replaced by `r`                           |
| `reactive.effect(() => ... $(r) ...)`    | run a side effect when what it reads changes  | `useEffect(block, [r, ...])` with the dependencies filled in     |
| `{... $(r) ...}` in JSX                  | read `r` inside any JSX expression            | the expression, with `$(r)` replaced by `r`                      |
| `<C prop={r} />`                         | pass to a component                           | `<C prop={{ value, update }} />`                                 |
| `{r}` in JSX, as a child or an attribute | use the value                                 | `{r}`                                                            |
| `useEffect(f, [r])`                      | a dependency of a React hook                  | `useEffect(f, [r])`                                              |
| `r.update`, `r.set` (not called)         | pass the updater as a function                | `setR`, `(x) => setR(() => x)`                                   |

`f(r)` is inlined when that is safe, so `cnt.derive((n) => n * 2)` becomes `cnt * 2`.

### Lenses and lists

```tsx
const state = reactive.new({ todos: [] as Todo[], draft: "" });
const todos = state.focus("todos");

return (
  <ul>
    {todos.each(
      (todo) => todo.id,
      (todo) => (
        <li onClick={() => todo.focus("done").update((done) => !done)}>
          {todo.derive((t) => t.title)}
        </li>
      ),
    )}
  </ul>
);
```

The update of one item's `done` is written back through the lens chain:

```tsx
setState((prev) => ({
  ...prev,
  todos: prev.todos.map((item) => (item.id === todo.id ? { ...item, done: !item.done } : item)),
}));
```

Items are matched by key, not by index, so an update still hits the right item
when the list is reordered by another update in the same batch.

### Narrowing

Both take how to tell the cases apart, then an object literal of branches. `match` tells them apart by a key
of a discriminated union; `when`, by a type guard, for everything else: `null`, `typeof`, `instanceof`, or a
guard of your own.

`when` takes the guard and `{ narrowed, rest }`. `narrowed` receives the narrowed value, still writable;
`rest` receives the rest, read-only. The guard can be an arrow function whose type predicate
TypeScript infers, so `null` needs no method of its own.

```tsx
const user = reactive.new<User | null>(null);

{
  user.when((u) => u !== null, {
    narrowed: (u) => (
      <input value={u.focus("name")} onChange={(e) => u.focus("name").set(e.target.value)} />
    ),
    rest: () => <button onClick={() => user.set({ name: "" })}>login</button>,
  });
}
```

becomes

```tsx
{
  user !== null ? (
    <input
      value={user.name}
      onChange={(e) =>
        setUser((prev) => (prev !== null ? { ...prev, name: e.target.value } : prev))
      }
    />
  ) : (
    <button onClick={() => setUser(() => ({ name: "" }))}>login</button>
  );
}
```

An update through the narrowed value checks the guard again when it is applied.
If the value no longer passes it, the update is dropped. Without `rest`, the result is `undefined`
when the guard is false.

`match` does the same for a discriminated union. The key is a string literal, and the type checker
requires one case per value of that property.

```tsx
{
  state.match("kind", {
    loading: () => <Spinner />,
    ok: (s) => <List items={s.focus("items")} />,
    error: (s) => <p>{s.derive((e) => e.message)}</p>,
  });
}
```

This becomes `state.kind === "loading" ? ... : state.kind === "ok" ? ... : ...`, and an update on `s`
in the `ok` case is written back as `(prev) => (prev.kind === "ok" ? f(prev) : prev)`.

Both return a `Derived` value, like `derive`. The branches must be an object literal, and each function
must be written in place (`(value) => ...`).

Inside an event handler or the block of `reactive.effect`, both can also be written as a statement,
for what the branches do:

```tsx
<button
  onClick={() => {
    user.when((u) => u !== null, {
      narrowed: (u) => u.focus("name").set(""),
      rest: () => user.set({ name: "" }),
    });
  }}
/>
```

This becomes `if (user !== null) { ... } else { ... }`. The branch is chosen with the value of the render
the handler belongs to, as in `reactive.handler`, and each update still checks the guard again when it is
applied. An arrow function without braces returns the result, so write the braces, or `void user.when(...)`.

### Crossing function boundaries

A reactive value can be passed to a component, passed to and returned from a custom hook,
and shared through Context. Declare the type as `Reactive<T>` or `Derived<T>`.

```tsx
// props
const Checkbox = ({ checked }: { checked: Reactive<boolean> }) =>
  checked.derive((value) => (
    <input type="checkbox" checked={value} onChange={() => checked.update((c) => !c)} />
  ));

<Checkbox checked={todo.focus("done")} />;

// custom hooks
const useCounter = (initial: number) => {
  const count = reactive.new(initial);
  return { count, double: count.derive((n) => n * 2) };
};

const { count, double } = useCounter(0);

// custom hooks, with the values in an array
const usePair = () => {
  const count = reactive.new(0);
  return [count, () => count.update((n) => n + 1)] as const;
};

const [count, inc] = usePair();

// Context
const Theme = createContext<Reactive<string>>(null!);

<Theme value={theme}>...</Theme>;
const theme = useContext(Theme);
```

At a boundary the value is represented at runtime as an object `{ value, update }`
(`update` is omitted for `Derived<T>`). The preprocessor builds it on the way out and unpacks it on the way in.
It unpacks a value bound with `const` to a plain name, directly to what gives it: `const x = useX()`,
`const { x } = useX()`, `const [x] = useX()`, also under `!` or `as`. Any other binding of a reactive
value (`let`, a default value, a nested destructuring) is a build error, so that the object never stays in place.

Babel cannot resolve types, so the preprocessor asks the TypeScript type checker which props,
parameters, and results are reactive. The type can live anywhere, including another file.

This needs **TypeScript 7 or later** (it uses the native compiler's API, `typescript/unstable/sync`)
and a `tsconfig.json` that includes the file. The code handed to the preprocessor must be the file
as it is on disk, so run it before any other transform.

Without TypeScript 7, pass `types: false`. The preprocessor then only reads type annotations written
in the same file: an inline props type, a local type alias or interface, and `x: Reactive<T>` on a
hook parameter or a `const`.

### Bringing plain React state in

```tsx
// a plain value, e.g. from an external store
const online = reactive.of(useSyncExternalStore(subscribe, getSnapshot));

// a value and an updater, e.g. from useReducer
const [state, dispatch] = useReducer(reducer, 0);
const n = reactive.from(state, (f) => dispatch({ type: "apply", f }));
```

### Effects

```tsx
reactive.effect(() => {
  const controller = new AbortController();
  search($(query), $(state.focus("page")), controller.signal).then((r) => results.set(r));
  return () => controller.abort();
});
```

becomes a `useEffect` whose dependency array is written by the preprocessor:

```tsx
useEffect(() => {
  const controller = new AbortController();
  search(query, state.page, controller.signal).then((r) => setResults(() => r));
  return () => controller.abort();
}, [query, state.page]);
```

- `$(r)` reads a reactive value, as in `reactive.derive`. Each value read is a dependency.
- Plain values of the component or custom hook that the block uses (props, parameters, local
  variables and functions) are dependencies too, so the effect never sees a stale value.
  Module-level variables, globals, and the generated setters are left out. The updater of `reactive.from`
  is written in the component, so what it reads is a dependency, not the function itself.
- With no dependency the array is `[]`: the effect runs once on mount.
- The block may return a cleanup function, as in `useEffect`. It cannot be `async`.
- `update` / `set` are allowed inside the block.

### What the preprocessor rejects

Misuse that the type checker cannot see is reported as a build error with a code frame:

- `reactive.new` inside a condition, a loop, or a nested function (it becomes a hook)
- a reactive value used as a plain value: `` `${cnt}` ``, `if (cnt)`, `console.log(cnt)`
- `update` / `set` during render (only allowed inside functions such as event handlers; the block of `reactive.derive`, the function of `derive`, the `render` of `each`, and the branches of `when` / `match` are rendered)
- `update` on a derived value
- `$` outside JSX `{...}`, `reactive.derive`, `reactive.handler`, and `reactive.effect`
- `reactive.effect` inside a condition, a loop, or a nested function (it becomes a hook)
- `reactive.effect` with an `async` block, with anything other than an inline function, or with its result used as a value
- `reactive.effect` that depends on a `const` or `let` declared below it (the dependency array is evaluated where the effect is written)
- `match` with a case named `true` or `false`: the cases are compared as strings. Use `when` for a boolean
- `when` / `match` as a statement during render (only allowed inside functions such as event handlers and effects)
- `reactive.from` given a literal, or a `const` of the same file that leads to one (`0`, `0 as const`, `const start = 0`): the value never changes. In TypeScript, writing the type, `reactive.from<number>(0, ...)` or `Reactive<number>` on the variable, says it is meant
- a reactive value received from a hook or a function bound in a form that is not unpacked: `let x = useX()`, a default value, a nested destructuring (see [Crossing function boundaries](#crossing-function-boundaries))

## Setup

### Install

```sh
pnpm add -D react-preprocessor
```

Node.js 22.12 or later is required. The package expects these peers in your project:

| Peer         | Version | Needed                                                                  |
| ------------ | ------- | ----------------------------------------------------------------------- |
| `react`      | >= 18   | always                                                                  |
| `typescript` | >= 7    | for the type-aware lookup of reactive props (on by default, see [Vite]) |
| `vite`       | >= 6    | only for `react-preprocessor/vite`                                      |
| `jotai`      | >= 2    | only for `react-preprocessor/jotai`                                     |

[Vite]: #vite

### TypeScript

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    // Lets a reactive value be used as an attribute: <input value={text} />
    "jsxImportSource": "react-preprocessor",
  },
}
```

At runtime `react-preprocessor/jsx-runtime` re-exports React's own JSX runtime.

### Vite

```ts
// vite.config.ts
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import reactPreprocessor from "react-preprocessor/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Order matters: lower the sugar first, then hand plain React to the React Compiler.
  plugins: [reactPreprocessor(), react(), babel({ presets: [reactCompilerPreset()] })],
});
```

Options: `reactPreprocessor({ types: false })` turns off the type-aware lookup of reactive props.

### Next.js

```ts
// next.config.ts
const nextConfig: NextConfig = {
  turbopack: {
    // Lower the sugar before Next.js's own transforms (SWC, React Compiler).
    rules: {
      "*.tsx": { loaders: ["react-preprocessor/loader"] },
      "*.ts": { loaders: ["react-preprocessor/loader"] },
    },
    // jsxImportSource is only needed for types. At runtime, read React's JSX runtime directly,
    // so that workspace packages without react-preprocessor installed still resolve it.
    resolveAlias: {
      "react-preprocessor/jsx-runtime": "react/jsx-runtime",
      "react-preprocessor/jsx-dev-runtime": "react/jsx-dev-runtime",
    },
  },
};
```

`react-preprocessor/loader` is a webpack loader, so the same loader works in a webpack config.

### Jotai

`react-preprocessor/jotai` reads atoms as reactive values.

```tsx
import { useReactiveAtom, useReactiveAtomValue } from "react-preprocessor/jotai";

const name = useReactiveAtom(nameAtom); // Reactive<string>, like useAtom
const error = useReactiveAtomValue(errorAtom); // Derived<string | undefined>, like useAtomValue

<input
  value={name}
  onChange={(e) => name.set(e.target.value)}
  aria-invalid={$(error) !== undefined}
/>;
```

`update(f)` applies `f` to the latest value in the store, so calling it twice in one event works,
also for an atom whose setter only takes a new value.

For other state libraries, wrap their values yourself with `reactive.of` and `reactive.from`.

### Babel

```js
// List react-preprocessor before the React Compiler.
export default {
  plugins: ["react-preprocessor/babel", "babel-plugin-react-compiler"],
};
```

### Lint

`react-preprocessor/eslint` reports in the editor what the build rejects (see [What the preprocessor rejects]),
at the code it points at. Its one rule, `react-preprocessor/valid-sugar`, runs the transform of the build on
the file, so it asks the type checker in the same way and needs TypeScript 7 for it.

oxlint is the simpler setup: it reads TypeScript itself. ESLint needs a TypeScript parser, and typescript-eslint
does not support TypeScript 7 on its own yet.

```jsonc
// .oxlintrc.json
{
  "jsPlugins": ["react-preprocessor/eslint"],
  "rules": { "react-preprocessor/valid-sugar": "error" },
}
```

```js
// eslint.config.js
import reactPreprocessor from "react-preprocessor/eslint";

export default [
  {
    files: ["**/*.{ts,tsx}"],
    ...reactPreprocessor.configs.recommended,
    // ESLint needs a parser that reads TypeScript and JSX to lint these files at all
    languageOptions: { parser: yourTypeScriptParser },
  },
];
```

- With ESLint, typescript-eslint works if the TypeScript 6 API is installed next to TypeScript 7. The rule itself
  reads the text of the file, not the tree the parser builds, so any parser that reads TypeScript and JSX works.
- The types are read from the files on disk. A file with unsaved changes is not checked; it is checked again when it is saved.
- The type checker runs in a process of its own. Run oxlint with fewer threads (`--threads 1`) if the rule reports that
  it could not be started: with many threads, Linux can refuse to start a process.
- Options: `{ "importSource": "...", "types": false }`, as for the build.

Turn off `react/no-unstable-nested-components` (ESLint, oxlint) if you use `match`. It mistakes the cases,
`{ ok: () => <p /> }`, for components defined during render.

Turn off `react/immutability` (oxlint) and `react-hooks/immutability` (ESLint) too if you use `reactive.effect`.
They do not know that its block is an effect, and report an assignment in it, such as `document.title = ...`,
as a write during render.

Biome runs only GritQL plugins, so `valid-sugar` is not available there: with Biome, misuse is reported by the
build. Biome's own recommended rules need nothing turned off for the sugar (checked with Biome 2.5).

[What the preprocessor rejects]: #what-the-preprocessor-rejects

## CLI

The package installs a `react-preprocessor` command.

### `print`: see what a file becomes

```sh
pnpm exec react-preprocessor print src/Todos.tsx
```

Writes the plain React the file is rewritten to on standard output. A file with no sugar is printed
as it is. An error of the transform goes to standard error with a code frame, and the exit code is 1.

The type checker is asked which props are reactive, as in the build. `--no-types` is `types: false`,
and `--import-source <name>` is `importSource`. Both also apply to `eject`.

### `eject`: stop using react-preprocessor

```sh
pnpm exec react-preprocessor eject src          # lists the files that would change
pnpm exec react-preprocessor eject src --write  # rewrites them
```

Rewrites the TypeScript files (`.ts`, `.tsx`, `.mts`, `.cts`) under the given directories and files to
the plain React they are lowered to. Declaration files, `node_modules`, and directories starting with
`.` are skipped; symbolic links are followed. If one file fails to transform, the errors are reported,
nothing is written, and the exit code is 1.

In the output, a reactive value that crosses a function boundary is an object `{ value, update }`,
but its type still reads `Reactive<T>`. So eject writes plain types of the same names to one file
and points the type imports from `react-preprocessor` at it:

```ts
// reactive-types.ts
export type Derived<T> = { value: T };
export type Reactive<T> = { value: T; update: (f: (old: T) => T) => void };
```

- The file goes to the directory of the first argument. `--types-file <path>` puts it elsewhere
  (a `.ts` file).
- `react-preprocessor/jotai` is runtime code, so it is copied next to the types as `reactive-jotai.ts`.
- Dynamic `import("react-preprocessor/jotai")` and `import("react-preprocessor").Reactive<T>` types are
  repointed as well. A reference with no plain counterpart, such as `import("react-preprocessor")`,
  is reported as an error.
- The new imports are relative, with the extension the project's own relative imports have
  (`./a.ts`, `./a.js`, or `./a`).

What is left to do by hand is printed at the end:

1. Run your formatter. Babel prints the rewritten files again, so they lose their formatting (comments are kept).
2. Remove the preprocessor from the build config (the Vite plugin, the loader, or the Babel plugin).
3. Remove `"jsxImportSource": "react-preprocessor"` from `tsconfig.json`.
4. Run the type checker, then uninstall `react-preprocessor`.

One shape needs a type written by hand: `reactive.from(value, update)` whose `value` is a constant with
a literal type that the preprocessor cannot see, such as one imported from another file or an enum member.
The updater is typed from the value, so it would only accept that literal. Write
`reactive.from<number>(START, ...)`, or `Reactive<number>` on the binding. A literal, or a `const` of the
same file that leads to one, is a build error already.

## Development

The toolchain is provided by a Nix flake (Node.js, pnpm, and Chromium for the browser tests). With direnv, `direnv allow` is enough.

```sh
nix develop
pnpm install
pnpm check   # format check, lint, type check, tests (including browser tests of the example)
pnpm dev     # run examples/counter
pnpm dev:website   # run the website
```

- `packages/react-preprocessor` — types (`src/index.ts`), Babel plugin (`src/babel.ts`), Vite plugin (`src/vite.ts`), ESLint plugin (`src/eslint.ts`)
- `examples/counter` — a Vite app using the sugar together with the React Compiler
- `website` — the website, written with the sugar. Pushing to `main` deploys it to GitHub Pages (`.github/workflows/pages.yml`)
- `PLAN.md` — design notes and roadmap

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute.

### Publishing

Only `packages/react-preprocessor` is published. A release is cut by pushing a tag; CI does the rest.

1. Bump `version` in `packages/react-preprocessor/package.json` and merge it to `main`.
2. Tag that commit and push the tag:

   ```sh
   git tag v<version> && git push origin v<version>
   ```

3. The `Release` workflow (`.github/workflows/release.yml`) checks that the tag matches the version,
   runs `pnpm check`, inspects the tarball with publint and Are the Types Wrong, and publishes to npm.

The workflow authenticates with npm [Trusted Publishing](https://docs.npmjs.com/trusted-publishers),
so no token is stored in the repository.

npm only lets you register a trusted publisher for a package that already exists, so the very first
version has to be published by hand:

```sh
cd packages/react-preprocessor
npm login
pnpm publish --access public
```

Then, on npmjs.com, open the package settings and add a trusted publisher: GitHub Actions,
this repository, workflow filename `release.yml`.

To inspect what would be published without releasing:

```sh
cd packages/react-preprocessor
pnpm pack --pack-destination /tmp
pnpm exec publint /tmp/react-preprocessor-<version>.tgz
pnpm exec attw --profile esm-only /tmp/react-preprocessor-<version>.tgz
```

## License

MIT
