import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { API, Checker, Snapshot, Type } from "typescript/unstable/sync";

/** The type of a reactive value. `optional` is a form that may be omitted, such as `Reactive<T> | undefined` */
export type Kind = "Reactive" | "Derived" | "optional";

export type Query = {
  /** Position of the variable name (offset from the start of the file, in UTF-16 code units) */
  position: number;
  /**
   * `value` asks for the type of the variable itself; `props` for the properties of the variable's type.
   * `params` asks for the type of the `index`-th parameter of the function at that position.
   * `attribute` asks for the type of the prop called `name` of the component at that position.
   * `returns` asks for the return type of the function at that position.
   */
  of: "value" | "props" | "params" | "attribute" | "returns";
  index?: number;
  name?: string;
};

export type Answer = {
  kind: Kind | null;
  /** The properties that are reactive values */
  props: Map<string, Kind>;
};

/**
 * The entry point for questions to the type checker.
 *
 * Babel cannot resolve types. To follow a props type declared in another file,
 * the types are asked from TypeScript.
 */
export type TypeService = {
  /** `code` is the content Babel parsed. If it differs from the content on disk the positions shift, so that is an error */
  query(file: string, code: string, queries: Query[]): Answer[];
  /** Tells that a file has changed. It is re-read on the next query */
  invalidate(): void;
  close(): void;
};

const load = (): typeof import("typescript/unstable/sync") => {
  try {
    return createRequire(import.meta.url)("typescript/unstable/sync");
  } catch (cause) {
    throw new Error(
      "The type-aware transform needs TypeScript 7 or later (`typescript/unstable/sync`). " +
        "Install it, or pass `types: false` to resolve reactive props from the syntax of the same file only.",
      { cause },
    );
  }
};

/** `Derived<T>` has the brand and `derive`. With `update` as well, it is a `Reactive<T>` */
const shapeOf = (checker: Checker, type: Type): "Reactive" | "Derived" | null => {
  if (!type.isObjectType()) return null;
  const names = new Set(checker.getPropertiesOfType(type).map((symbol) => symbol.name));
  const branded = [...names].some((name) => name.startsWith("__@brand@"));
  if (!branded || !names.has("derive")) return null;
  return names.has("update") ? "Reactive" : "Derived";
};

export const createTypeService = (): TypeService => {
  let api: API | undefined;
  let snapshot: Snapshot | undefined;
  let stale = false;
  /** The files opened in the snapshot, with the content each was opened with */
  const opened = new Map<string, string>();
  // Looks up the result by type id. Ids are assigned separately per type checker (tsconfig project),
  // so results are kept per type checker. Rebuilding the snapshot also creates new type checkers
  const kindsByChecker = new WeakMap<Checker, Map<number, Kind | null>>();

  const checkerFor = (file: string, code: string): Checker => {
    api ??= new (load().API)({ cwd: process.cwd() });
    // The file is open with other content, so its positions have shifted. Nothing may have said that it
    // changed: the webpack loader has no change notification, unlike the Vite plugin
    if (opened.has(file) && opened.get(file) !== code) stale = true;
    if (!snapshot || stale || !opened.has(file)) {
      if (stale && snapshot) {
        // `invalidateAll` alone keeps answering from the old files: they are read again only once
        // the files opened here are closed (TypeScript 7.0)
        const closed = api.updateSnapshot({ closeFiles: [...opened.keys()] });
        snapshot.dispose();
        snapshot = closed;
        opened.clear();
      }
      const previous = snapshot;
      snapshot = api.updateSnapshot({
        openFiles: opened.has(file) ? [] : [file],
        ...(stale ? { fileChanges: { invalidateAll: true } } : {}),
      });
      previous?.dispose();
      opened.set(file, code);
      stale = false;
    }
    const project = snapshot.getDefaultProjectForFile(file);
    if (!project) throw new Error(`No TypeScript project contains ${file}.`);
    return project.checker;
  };

  const kindOf = (checker: Checker, type: Type | undefined): Kind | null => {
    if (!type) return null;
    let kinds = kindsByChecker.get(checker);
    if (!kinds) kindsByChecker.set(checker, (kinds = new Map()));
    const known = kinds.get(type.id);
    if (known !== undefined) return known;
    let kind: Kind | null = shapeOf(checker, type);
    if (!kind && type.isUnionType()) {
      const present = checker.getNonNullableType(type);
      if (present && present.id !== type.id && shapeOf(checker, present)) kind = "optional";
    }
    kinds.set(type.id, kind);
    return kind;
  };

  return {
    query(file, code, queries) {
      let onDisk: string | undefined;
      try {
        onDisk = readFileSync(file, "utf8");
      } catch {
        // Reported as the same error below
      }
      if (onDisk !== code) {
        throw new Error(
          `The type-aware transform reads types from the file on disk, but the code being transformed differs from ${file}. ` +
            "Run react-preprocessor before any other transform, or pass `types: false`.",
        );
      }

      const checker = checkerFor(file, code);
      const types = checker.getTypeAtPosition(
        file,
        queries.map((query) => query.position),
      );
      return queries.map((query, index): Answer => {
        const type = types[index];
        const props = new Map<string, Kind>();
        if (query.of === "value" || !type) return { kind: kindOf(checker, type), props };
        if (query.of === "attribute") {
          for (const signature of checker.getSignaturesOfType(type, load().SignatureKind.Call)) {
            const propsType = checker.getParameterType(signature, 0);
            const symbol = propsType && checker.getPropertyOfType(propsType, query.name ?? "");
            const kind = symbol ? kindOf(checker, checker.getTypeOfSymbol(symbol)) : null;
            if (kind) return { kind, props };
          }
          return { kind: null, props };
        }
        if (query.of === "returns") {
          for (const signature of checker.getSignaturesOfType(type, load().SignatureKind.Call)) {
            const kind = kindOf(checker, checker.getReturnTypeOfSignature(signature));
            if (kind) return { kind, props };
          }
          return { kind: null, props };
        }
        if (query.of === "params") {
          // If any one of the overloads accepts it, it counts as accepted
          for (const signature of checker.getSignaturesOfType(type, load().SignatureKind.Call)) {
            const kind = kindOf(checker, checker.getParameterType(signature, query.index ?? 0));
            if (kind) return { kind, props };
          }
          return { kind: null, props };
        }
        const symbols = checker.getPropertiesOfType(type);
        const propTypes = checker.getTypeOfSymbol(symbols);
        for (const [i, symbol] of symbols.entries()) {
          const kind = kindOf(checker, propTypes[i]);
          if (kind) props.set(symbol.name, kind);
        }
        return { kind: null, props };
      });
    },

    invalidate() {
      stale = true;
    },

    close() {
      api?.close();
      api = undefined;
      snapshot = undefined;
      opened.clear();
    },
  };
};
