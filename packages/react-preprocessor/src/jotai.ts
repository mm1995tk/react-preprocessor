import { useAtomValue, useStore } from "jotai";
import type { Atom, WritableAtom } from "jotai";
import { useCallback } from "react";
import type { Derived, Reactive } from "./index.ts";

type Options = Parameters<typeof useStore>[0];

// This is the only module with runtime code. It builds and returns `{ value, update }`,
// the representation of a reactive value that crosses a function boundary. On the receiving side,
// the preprocessor sees the return type and rewrites to `const { value, update } = useReactiveAtom(...)`.

/**
 * Reads a Jotai atom as a read-only reactive value. The counterpart of `useAtomValue`.
 */
export function useReactiveAtomValue<Value>(
  atom: Atom<Value>,
  options?: Options,
): Derived<Awaited<Value>> {
  const value = useAtomValue(atom, options);
  return { value } as unknown as Derived<Awaited<Value>>;
}

/**
 * Reads a Jotai atom as a writable reactive value. The counterpart of `useAtom`.
 *
 * The atom must accept a single new value on write. `update(f)` applies `f` to
 * the latest value read from the store and writes the result. When `update` is called
 * several times in one event, each call receives the result of the previous one.
 *
 * An async atom cannot be written. To only read one, use `useReactiveAtomValue`.
 */
export function useReactiveAtom<Value>(
  atom: WritableAtom<Value, [NoInfer<Value>], unknown>,
  options?: Options,
): Reactive<Value> {
  const store = useStore(options);
  const value = useAtomValue(atom, options);
  const update = useCallback(
    (f: (old: Value) => Value): void => void store.set(atom, f(store.get(atom))),
    [store, atom],
  );
  return { value, update } as unknown as Reactive<Value>;
}
