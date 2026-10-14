# Contributing

Thank you for your interest in react-preprocessor. The project is experimental and the API is still
changing, so please open an issue before starting on a large change.

## Language

Everything in the repository is written in English: code, comments, documentation, commit messages,
issues, and pull requests.

## Setup

The toolchain (Node.js, pnpm, and Chromium for the browser tests) is provided by a Nix flake.

```sh
nix develop      # or `direnv allow` with direnv
pnpm install
```

Without Nix, install Node.js 22.12 or later and pnpm yourself, and set `CHROMIUM_PATH` to a Chromium
executable for the browser tests.

## Commands

```sh
pnpm check      # everything CI runs: format check, lint, type check, tests
pnpm fmt        # format
pnpm lint:fix   # lint and apply the automatic fixes
pnpm test       # tests only
pnpm dev        # run examples/counter
```

Run `pnpm check` before opening a pull request.

## Layout

- `packages/react-preprocessor/src/index.ts` — the types of the sugar
- `packages/react-preprocessor/src/babel.ts` — the Babel plugin that lowers the sugar to plain React
- `packages/react-preprocessor/src/types.ts` — the queries to the TypeScript type checker
- `packages/react-preprocessor/src/vite.ts`, `src/loader.ts` — the Vite plugin and the webpack loader
- `packages/react-preprocessor/src/cli.ts`, `src/commands.ts` — the `react-preprocessor` command (`print`, `eject`)
- `packages/react-preprocessor/test` — tests
- `examples/counter` — a Vite app with browser tests
- `website` — the website
- `PLAN.md` — design notes and decisions

## Tests

A change to the transform needs a test.

- **Fixtures** (`test/fixtures/<name>/input.tsx` and `output.tsx`): the expected output of the
  transform. To add one, create a directory with `input.tsx`; the first test run writes `output.tsx`.
  After an intended change to the output, update the files with `pnpm -F react-preprocessor test -u`
  and review the diff.
- **Errors** (`test/transform.test.ts`): each misuse the preprocessor rejects, with the expected message.
- **Types** (`test/types.test-d.tsx`): misuses the types reject, marked with `@ts-expect-error`.
- **Runtime** (`test/runtime.test.tsx`): components written with the sugar, rendered and exercised.
- **Type-aware transform** (`test/typed`): cases that need the type checker, such as props declared in
  another file.

## Pull requests

- Keep a pull request to one topic.
- Describe what changes for a user of the library, and why.
- When the public API changes, update `README.md` in the same pull request.

## Reporting bugs

Open an issue with the input code, the output or the error you got, what you expected, and the
versions of react-preprocessor, TypeScript, and your bundler.

## License

By contributing, you agree that your contributions are licensed under the MIT License.
