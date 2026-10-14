import type { Key, ReactNode } from "react";

declare const brand: unique symbol;

/**
 * A read-only reactive value. `derive` and `reactive.derive` return this type.
 *
 * There is no `get` to take the value out. To use the value, derive from it with `derive` or embed it in JSX.
 * To read it inside an event handler, use `reactive.handler`.
 * This type exists only at compile time; the preprocessor replaces it with the plain value.
 */
export interface Derived<out T> {
  readonly [brand]: T;

  /** Creates a derived value. `f` must be a pure function. */
  derive<U>(f: (value: T) => U): Derived<U>;

  /**
   * Renders a list by splitting it into one reactive value per item.
   * `key` returns a value that identifies the item. It also becomes the React `key`.
   */
  each<U>(
    this: Derived<readonly U[]>,
    key: (item: U) => Key,
    render: (item: Derived<U>) => ReactNode,
  ): ReactNode;

  /**
   * Narrows the value with a type guard: `r.when(guard, { narrowed, rest })`. `narrowed` receives the value
   * narrowed by the guard, and `rest` receives the rest. Without `rest`, the result is `undefined` when the guard is false.
   */
  // `A` is `T`. It is taken from `this`, like the item type of `each`, so that `T` stays covariant
  when<A, S extends A, U, V = undefined>(
    this: Derived<A>,
    guard: (value: A) => value is S,
    branches: { narrowed: (value: Derived<S>) => U; rest?: (value: Derived<Exclude<A, S>>) => V },
  ): Derived<U | V>;

  /**
   * Narrows a discriminated union. `key` is the property that tells the members apart,
   * and `cases` has one function per value of that property. Every value must have a case.
   *
   * On a writable value, each function receives a writable value. An `update` on it is written back
   * to the original while it is still that case, and is dropped otherwise.
   */
  // Declared once for both interfaces: the receiver is the type parameter `R`, and `Narrowed`
  // gives a case the same kind of value. The cases are inferred as a whole (`C`), because a result
  // type cannot be inferred through a mapped type; the second half of the constraint rejects
  // a case that is not a value of the key.
  match<
    R extends Derived<unknown>,
    K extends keyof Inner<R> & string,
    C extends {
      [V in Inner<R>[K] & PropertyKey]: (
        value: Narrowed<R, Extract<Inner<R>, Record<K, V>>>,
      ) => unknown;
    } & { [X in Exclude<keyof C, Inner<R>[K]>]: never },
  >(
    this: R,
    key: K,
    cases: C,
  ): Derived<C[keyof C] extends (...args: never[]) => infer U ? U : never>;
}

/** The `T` of a `Derived<T>` / `Reactive<T>` */
type Inner<R> = R extends Derived<infer T> ? T : never;

/** A reactive value holding `S`, writable when `R` is */
type Narrowed<R, S> = R extends { update: unknown } ? Reactive<S> : Derived<S>;

/**
 * A writable reactive value. Created with `reactive.new`.
 */
export interface Reactive<T> extends Derived<T> {
  /** Updates the value with a pure function from the old value to the new one. */
  update(f: (old: T) => T): void;

  /** Replaces the value. A shortcut for `update(() => value)`. */
  set(value: T): void;

  /** Lens. Focuses on a part of an object. An `update` on the focused value is written back to the original. */
  focus<K extends keyof T & string>(key: K): Reactive<T[K]>;

  /** An `update` on an item is written back to the original list. */
  each<U>(
    this: Reactive<U[]>,
    key: (item: U) => Key,
    render: (item: Reactive<U>) => ReactNode,
  ): ReactNode;

  /**
   * An `update` on the narrowed value is written back to the original. The guard is checked again
   * at that time, and the update is dropped if it no longer holds. The rest is read-only.
   */
  when<A, S extends A, U, V = undefined>(
    this: Reactive<A>,
    guard: (value: A) => value is S,
    branches: { narrowed: (value: Reactive<S>) => U; rest?: (value: Derived<Exclude<A, S>>) => V },
  ): Derived<U | V>;
}

/** A reactive value that can be embedded in JSX */
export interface ReactiveNode extends Derived<ReactNode> {}

declare module "react" {
  // Lets a value be embedded in JSX directly, as in `{cnt}`.
  // ReactNode includes the value types of this interface, so adding here is the only extension point.
  interface DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_REACT_NODES {
    "react-preprocessor": ReactiveNode;
  }
}

const untransformed = (api: string): never => {
  throw new Error(
    `react-preprocessor: \`${api}\` was called at runtime. ` +
      "This file was not transformed. Add the react-preprocessor Babel or Vite plugin to your build.",
  );
};

export const reactive: {
  /** Creates a reactive value. Can only be called at the top level of a component body. */
  new: <T>(initial: T) => Reactive<T>;

  /**
   * Treats a plain value as a read-only reactive value.
   * Used to bring in a value from an external store or Context.
   */
  of: <T>(value: T) => Derived<T>;

  /**
   * Treats a pair of a plain value and an update function as a writable reactive value.
   * Used to bring in `useReducer` or an external store. `update` takes an updater (old value → new value).
   */
  from: <T>(value: T, update: (f: (old: T) => T) => void) => Reactive<T>;

  /**
   * Creates an event handler. Inside the function, `$(r)` gives the value inside a `Derived<T>`.
   *
   *     onSubmit={reactive.handler((e) => { const token = $(turnstileToken); ... })}
   *
   * The value read is the one at the time of the render.
   */
  handler: <F extends (...args: never[]) => unknown>(f: F) => F;

  /** Creates a derived value from several reactive values. Inside the block, `$(r)` gives the value inside a `Derived<T>`. */
  derive: <T>(block: () => T) => Derived<T>;

  /**
   * Runs a side effect after render. Inside the block, `$(r)` gives the value inside a `Derived<T>`.
   *
   *     reactive.effect(() => { document.title = $(title); });
   *
   * The effect runs again when a value read with `$`, or a plain value of the component that the block
   * uses, has changed. The preprocessor lists the dependencies. With none, it runs once on mount.
   * The block may return a cleanup function, as in `useEffect`.
   * Can only be called at the top level of a component body.
   */
  effect: (block: () => void | (() => void)) => void;
} = {
  new: () => untransformed("reactive.new"),
  of: () => untransformed("reactive.of"),
  from: () => untransformed("reactive.from"),
  handler: () => untransformed("reactive.handler"),
  derive: () => untransformed("reactive.derive"),
  effect: () => untransformed("reactive.effect"),
};

/**
 * Reads the value inside a reactive value. Only usable inside JSX `{...}`, inside `reactive.derive`,
 * inside `reactive.handler`, and inside `reactive.effect`. At the type level it returns the inner value.
 */
export const $: <T>(r: Derived<T>) => T = () => untransformed("$");
