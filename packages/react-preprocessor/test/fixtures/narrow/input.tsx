import { reactive, type Derived, type Reactive } from "react-preprocessor";

type User = { name: string; age: number };
type Item = { id: number; title: string };
type Remote =
  | { kind: "loading" }
  | { kind: "ok"; items: Item[]; page: number }
  | { kind: "error"; error: Error };

const isAdult = (user: User): user is User & { adult: true } => user.age >= 20;

export const Login = () => {
  const user: Reactive<User | null> = reactive.new(null);
  const state = reactive.new({ user: null as User | null, remote: { kind: "loading" } as Remote });
  const remote = state.focus("remote");

  // Without `rest`, the false side is `undefined`
  const greeting = user.when((u) => u !== null, {
    narrowed: (u) => u.derive((value) => `hello, ${value.name}`),
  });

  return (
    <>
      {user.when((u) => u !== null, {
        narrowed: (u) => (
          <input
            value={u.focus("name")}
            onChange={(e) => u.focus("name").update(() => e.target.value)}
          />
        ),
        rest: () => (
          <button onClick={() => user.update(() => ({ name: "", age: 0 }))}>login</button>
        ),
      })}
      <p>{greeting}</p>
      {state.focus("user").when((u) => u !== null, {
        narrowed: (u: Reactive<User>) =>
          u.when(isAdult, {
            narrowed: (adult) => (
              <button onClick={() => adult.focus("name").set("adult")}>
                {adult.focus("name")}
              </button>
            ),
            rest: (minor: Derived<User>) => <i>{minor.derive((m) => m.age)}</i>,
          }),
        rest: (rest) => <i>{rest.derive((r) => String(r))}</i>,
      })}
      {remote.match("kind", {
        loading: () => <progress />,
        ok: (s) => (
          <ul>
            {s.focus("items").each(
              (item) => item.id,
              (item) => (
                <li onClick={() => item.focus("title").update((title) => title.toUpperCase())}>
                  {item.focus("title")}
                </li>
              ),
            )}
            <button onClick={() => s.focus("page").update((page) => page + 1)}>next</button>
          </ul>
        ),
        error: (s) => <p>{s.derive((e) => e.error.message)}</p>,
      })}
      {remote
        .derive((r) => (r.kind === "ok" ? r.items.length : null))
        .when((n) => n !== null, {
          narrowed: (n) => (
            <b>
              {n} of {n}
            </b>
          ),
          rest: () => {
            return <b>none</b>;
          },
        })}
    </>
  );
};
