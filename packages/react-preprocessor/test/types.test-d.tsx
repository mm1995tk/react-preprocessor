// A file that is only type-checked. If `pnpm typecheck` passes, the types reject the misuses.
import type { ReactNode } from "react";
import { $, reactive, type Derived, type Reactive } from "react-preprocessor";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(): T => true as T;

const cnt = reactive.new(0);
assert<Equal<typeof cnt, Reactive<number>>>();

const double = cnt.derive((n) => n * 2);
assert<Equal<typeof double, Derived<number>>>();

const sum = reactive.derive(() => `${$(cnt) + $(double)}`);
assert<Equal<typeof sum, Derived<string>>>();

const viaDo = reactive.derive(() => $(cnt) + $(double));
assert<Equal<typeof viaDo, Derived<number>>>();

// Inside an event handler, $ reads the inner value. The function type is returned as is
const onClick = reactive.handler((e: { x: number }) => $(cnt) + e.x);
assert<Equal<typeof onClick, (e: { x: number }) => number>>();
// The argument type comes from the attribute it is passed to
const form = <form onSubmit={reactive.handler((e) => e.preventDefault())} />;
// Inside an effect, $ reads the inner value. A cleanup function can be returned
const noResult = reactive.effect(() => {
  const read: number = $(cnt);
  return () => console.log(read);
});
assert<Equal<typeof noResult, void>>();
reactive.effect(() => cnt.set($(double)));
// The block is synchronous and takes no parameter
// @ts-expect-error
reactive.effect(async () => {});
// @ts-expect-error
reactive.effect((n: number) => {});
// Only a cleanup function can be returned
// @ts-expect-error
reactive.effect(() => $(cnt));
// There is no method that takes the inner value out directly
// @ts-expect-error
cnt.with((n) => n);

cnt.update((n) => n + 1);

// A writable value can be passed as a read-only value
const readonly: Derived<number> = cnt;
// Covariant
const wider: Derived<number | string> = double;

// There is no way to take the inner value out
// @ts-expect-error
cnt.get();
// @ts-expect-error
cnt.value;

// Cannot be used as a plain value
// @ts-expect-error
cnt + 1;
// @ts-expect-error
const n: number = cnt;
// @ts-expect-error
Math.abs(double);

// A plain value is not a reactive value
// @ts-expect-error
const fake: Derived<number> = 1;
// @ts-expect-error
$(1);

// A derived value cannot be written
// @ts-expect-error
double.update((n) => n + 1);
// @ts-expect-error
const writable: Reactive<number> = double;

// An update returns the same type as the old value
// @ts-expect-error
cnt.update((n) => `${n}`);

// Lens
const state = reactive.new({ name: "a", tags: ["x"], nested: { n: 1 } });
const name = state.focus("name");
assert<Equal<typeof name, Reactive<string>>>();
const deep = state.focus("nested").focus("n");
assert<Equal<typeof deep, Reactive<number>>>();
// @ts-expect-error
state.focus("missing");
// @ts-expect-error
state.derive((s) => s.name).focus("length");

// List
const list: ReactNode = state.focus("tags").each(
  (tag) => tag,
  (tag) => {
    assert<Equal<typeof tag, Reactive<string>>>();
    return <li>{tag}</li>;
  },
);
const readonlyList: ReactNode = state
  .derive((s) => s.tags)
  .each(
    (tag) => tag,
    (tag) => {
      assert<Equal<typeof tag, Derived<string>>>();
      return <li>{tag}</li>;
    },
  );
const renderTag = (tag: Derived<string>): ReactNode => <li>{tag}</li>;
// Cannot be used on a value that is not a list
// @ts-expect-error
name.each((c: string) => c, renderTag);
// The key is a value that can be a React key
// @ts-expect-error
state.focus("tags").each((tag) => ({ tag }), renderTag);

// Narrowing
type User = { name: string };
const maybe = reactive.new<User | null>(null);
// The type predicate is inferred from the guard. No method specific to null is needed
const login = maybe.when((u) => u !== null, {
  narrowed: (u) => {
    assert<Equal<typeof u, Reactive<User>>>();
    return u.focus("name");
  },
  rest: (rest) => {
    // The rest is read-only
    assert<Equal<typeof rest, Derived<null>>>();
    return 0;
  },
});
assert<Equal<typeof login, Derived<Reactive<string> | number>>>();
// The branches are `narrowed` and `rest`
// @ts-expect-error
maybe.when((u) => u !== null, { then: () => 1, otherwise: () => 2 });
// @ts-expect-error
maybe.when((u) => u !== null, { rest: () => 1 });

// Without `rest`, the result may be undefined
const maybeName = maybe.when((u) => u !== null, { narrowed: (u) => u.derive((user) => user.name) });
assert<Equal<typeof maybeName, Derived<Derived<string> | undefined>>>();
// A declared type guard
const isString = (value: unknown): value is string => typeof value === "string";
const text = reactive.new<string | number>(0).when(isString, {
  narrowed: (s) => assert<Equal<typeof s, Reactive<string>>>(),
  rest: (n) => assert<Equal<typeof n, Derived<number>>>(),
});
assert<Equal<typeof text, Derived<true>>>();
// On a derived value, the narrowed value is read-only too
const readonlyWhen = maybe
  .derive((u) => u)
  .when((u) => u !== null, {
    narrowed: (u) => {
      assert<Equal<typeof u, Derived<User>>>();
      // @ts-expect-error
      u.set({ name: "" });
      return 1;
    },
  });
assert<Equal<typeof readonlyWhen, Derived<number | undefined>>>();
// The guard must be a type guard
const isPositive = (n: number): boolean => n > 0;
// @ts-expect-error
cnt.when(isPositive, { narrowed: () => 1 });
// The rest cannot be written
const isUser = (u: User | null): u is User => u !== null;
maybe.when(isUser, {
  narrowed: () => 1,
  rest: (rest) => {
    // @ts-expect-error
    rest.set(null);
  },
});
// Usable in JSX
const whenNode: ReactNode = maybe.when((u) => u !== null, {
  narrowed: (u) => <p>{u.focus("name")}</p>,
  rest: () => <p>nobody</p>,
});

// Discriminated unions
type Remote =
  | { kind: "loading" }
  | { kind: "ok"; items: string[] }
  | { kind: "error"; error: Error };
const remote = reactive.new<Remote>({ kind: "loading" });
const matched = remote.match("kind", {
  loading: (s) => {
    assert<Equal<typeof s, Reactive<{ kind: "loading" }>>>();
    return 0;
  },
  ok: (s) => {
    assert<Equal<typeof s, Reactive<{ kind: "ok"; items: string[] }>>>();
    const items = s.focus("items");
    assert<Equal<typeof items, Reactive<string[]>>>();
    return 1;
  },
  error: (s) => {
    assert<Equal<typeof s, Reactive<{ kind: "error"; error: Error }>>>();
    return 2;
  },
});
assert<Equal<typeof matched, Derived<number>>>();
// The result is whatever the cases return
const mixed = remote.match("kind", {
  loading: () => null,
  ok: (s) => s.focus("items"),
  error: () => "failed",
});
assert<Equal<typeof mixed, Derived<Reactive<string[]> | string | null>>>();
// The values of the key can be numbers
const coded = reactive.new<{ code: 1; text: string } | { code: 2 }>({ code: 2 });
const byCode = coded.match("code", { 1: (s) => s.focus("text"), 2: () => 0 });
assert<Equal<typeof byCode, Derived<Reactive<string> | number>>>();
const readonlyMatch: ReactNode = remote
  .derive((r) => r)
  .match("kind", {
    loading: () => <progress />,
    ok: (s) => {
      assert<Equal<typeof s, Derived<{ kind: "ok"; items: string[] }>>>();
      return <p>{s.derive((r) => r.items.length)}</p>;
    },
    error: (s) => <p>{s.derive((r) => r.error.message)}</p>,
  });
// Every case must be handled
// @ts-expect-error
remote.match("kind", { loading: () => 0, ok: () => 1 });
// There is no such case
// @ts-expect-error
remote.match("kind", { loading: () => 0, ok: () => 1, error: () => 2, other: () => 3 });
// The key is a property that every member has
// @ts-expect-error
remote.match("items", {});

// Narrowing keeps the value covariant
const widerUser: Derived<User | null | undefined> = maybe;
const widerRemote: Derived<Remote | { kind: "idle" }> = reactive.new({
  kind: "loading" as const,
  since: 0,
});

// Only renderable values can be embedded in JSX
const node: ReactNode = cnt;
const element = (
  <p>
    {cnt} {sum}{" "}
    {double.derive((d) => (
      <b>{d}</b>
    ))}
  </p>
);
const user = reactive.new({ name: "a" });
// @ts-expect-error
const bad = <p>{user}</p>;
// An attribute accepts a reactive value holding a value of the attribute's type
const attr = <input value={sum} disabled={cnt.derive((n) => n > 0)} />;
// @ts-expect-error
const badAttr = <input value={user} />;

// Replacing the value
cnt.set(1);
// @ts-expect-error
cnt.set("1");
// @ts-expect-error
double.set(1);
const setCnt: (value: number) => void = cnt.set;

export {
  form,
  list,
  readonlyList,
  readonly,
  wider,
  whenNode,
  readonlyMatch,
  widerUser,
  widerRemote,
  n,
  fake,
  writable,
  node,
  element,
  bad,
  attr,
  badAttr,
  setCnt,
};
