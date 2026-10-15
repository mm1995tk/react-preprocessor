import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { startTransition, useEffect } from "react";
import { afterEach, expect, test } from "vitest";
import { $, reactive, type Derived, type Reactive } from "react-preprocessor";
import { AtomCounter } from "./typed/Atoms.tsx";
import { Chained, Counter as HookCounter, Paired, Reduced, Themed } from "./typed/Hooks.tsx";
import { Item } from "./typed/Item.tsx";
import { Names, Switch } from "./typed/Narrowed.tsx";

afterEach(cleanup);

const Counter = () => {
  const cnt: Reactive<number> = reactive.new(0);
  const double = cnt.derive((n) => n * 2);
  return (
    <>
      <p>
        now: {cnt} / double: {double}
      </p>
      <button onClick={() => cnt.update((n) => n + 1)}>inc</button>
    </>
  );
};

test("Counter", () => {
  render(<Counter />);
  expect(screen.getByRole("paragraph").textContent).toBe("now: 0 / double: 0");
  fireEvent.click(screen.getByText("inc"));
  fireEvent.click(screen.getByText("inc"));
  expect(screen.getByRole("paragraph").textContent).toBe("now: 2 / double: 4");
});

const seen: number[] = [];

const Cart = () => {
  const price = reactive.new(100);
  const qty = reactive.new(1);
  const total: Derived<number> = reactive.derive(() => $(price) * $(qty));
  const label = reactive.derive(() => ($(total) >= 300 ? "expensive" : "cheap"));
  return qty.derive((q) => (
    <>
      <input
        aria-label="qty"
        value={q}
        onChange={(e) => qty.update(() => Number(e.target.value))}
      />
      <output>
        {total} {label}
      </output>
      <button onClick={reactive.handler(() => seen.push($(total)))}>log</button>
    </>
  ));
};

test("derive, handler", () => {
  render(<Cart />);
  expect(screen.getByRole("status").textContent).toBe("100 cheap");
  fireEvent.change(screen.getByLabelText("qty"), { target: { value: "3" } });
  expect(screen.getByRole("status").textContent).toBe("300 expensive");
  fireEvent.click(screen.getByText("log"));
  expect(seen).toEqual([300]);
});

const Holder = () => {
  const f = reactive.new((n: number) => n + 1);
  return (
    <>
      <output>{f.derive((g) => g(1))}</output>
      <button onClick={() => f.update(() => (n) => n * 10)}>swap</button>
    </>
  );
};

test("a function can be held as a value", () => {
  render(<Holder />);
  expect(screen.getByRole("status").textContent).toBe("2");
  act(() => screen.getByText("swap").click());
  expect(screen.getByRole("status").textContent).toBe("10");
});

type Todo = { id: number; title: string; done: boolean };

const Todos = () => {
  const state = reactive.new({
    todos: [
      { id: 1, title: "a", done: false },
      { id: 2, title: "b", done: false },
    ] as Todo[],
    nextId: 3,
  });
  const todos = state.focus("todos");

  const add = () =>
    state.update((s) => ({
      todos: [{ id: s.nextId, title: "new", done: false }, ...s.todos],
      nextId: s.nextId + 1,
    }));

  return (
    <>
      <button onClick={add}>add</button>
      <ul>
        {todos.each(
          (todo) => todo.id,
          (todo) => (
            <li data-testid={todo.derive((t) => `todo-${t.id}`)}>
              {todo.derive((t) => `${t.title}:${t.done}`)}
              <button
                onClick={() => {
                  // Updates the same item even after an item is added at the front and the order shifts
                  add();
                  todo.focus("done").update((done) => !done);
                }}
              >
                toggle
              </button>
              <button
                onClick={reactive.handler(() => {
                  const { id } = $(todo);
                  todos.update((list) => list.filter((x) => x.id !== id));
                })}
              >
                remove
              </button>
            </li>
          ),
        )}
      </ul>
      <output>{todos.derive((list) => list.filter((t) => !t.done).length)}</output>
    </>
  );
};

const item = (id: number): HTMLElement => screen.getByTestId(`todo-${id}`);

test("focus and each write back to the source", () => {
  render(<Todos />);
  expect(screen.getByRole("status").textContent).toBe("2");

  fireEvent.click(item(2).querySelector("button")!);
  expect(item(2).textContent).toContain("b:true");
  expect(item(1).textContent).toContain("a:false");
  expect(item(3).textContent).toContain("new:false");
  expect(screen.getByRole("status").textContent).toBe("2");

  fireEvent.click(item(1).querySelectorAll("button")[1]!);
  expect(screen.queryByTestId("todo-1")).toBeNull();
  expect(screen.getAllByRole("listitem").map((li) => li.dataset.testid)).toEqual([
    "todo-3",
    "todo-2",
  ]);
});

type Bag = { __proto__: number; n: number };

const ProtoKey = () => {
  // JSON.parse defines `__proto__` as an ordinary property
  const bag = reactive.new<Bag>(JSON.parse(`{ "__proto__": 1, "n": 0 }`));
  const count = bag.focus("__proto__");
  return (
    <>
      <button onClick={() => count.update((n) => n + 1)}>inc</button>
      <output>
        {bag.derive(
          (b) => `${Object.entries(b).join(";")}:${Object.getPrototypeOf(b) === Object.prototype}`,
        )}
      </output>
    </>
  );
};

test("focus on `__proto__` updates the property, not the prototype", () => {
  render(<ProtoKey />);
  expect(screen.getByRole("status").textContent).toBe("__proto__,1;n,0:true");
  fireEvent.click(screen.getByText("inc"));
  expect(screen.getByRole("status").textContent).toBe("__proto__,2;n,0:true");
});

const Toggle = ({ on, label }: { on: Reactive<boolean>; label: Derived<string> }) => (
  <button onClick={() => on.update((value) => !value)}>
    {label}:{on.derive((value) => (value ? "on" : "off"))}
  </button>
);

type RowProps = { todo: Reactive<Todo> };
const Row = (props: RowProps) => (
  <li>
    <Toggle on={props.todo.focus("done")} label={props.todo.derive((t) => t.title)} />
  </li>
);

const Board = () => {
  const todos = reactive.new<Todo[]>([
    { id: 1, title: "a", done: false },
    { id: 2, title: "b", done: true },
  ]);
  return (
    <>
      <ul>
        {todos.each(
          (todo) => todo.id,
          (todo) => (
            <Row todo={todo} />
          ),
        )}
      </ul>
      <output>{todos.derive((list) => list.filter((t) => t.done).length)}</output>
    </>
  );
};

test("reactive values cross component boundaries as props", () => {
  render(<Board />);
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["a:off", "b:on"]);
  fireEvent.click(screen.getByText("a:off"));
  fireEvent.click(screen.getByText("b:on"));
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["a:on", "b:off"]);
  expect(screen.getByRole("status").textContent).toBe("1");
});

const Shelf = () => {
  const todos = reactive.new<Todo[]>([{ id: 1, title: "a", done: false }]);
  const remove = (id: number) => todos.update((list) => list.filter((t) => t.id !== id));
  return (
    <ul>
      {todos.each(
        (todo) => todo.id,
        (todo) => (
          <Item
            todo={todo}
            count={todos.derive((list) => list.filter((t) => t.done).length)}
            label="item"
            onRemove={remove}
          />
        ),
      )}
    </ul>
  );
};

test("props whose type lives in another file", () => {
  render(<Shelf />);
  expect(screen.getByRole("listitem").textContent).toContain("item 0 a");
  fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByRole("listitem").textContent).toContain("item 1 a");
  fireEvent.click(screen.getByText("remove"));
  expect(screen.queryByRole("listitem")).toBeNull();
});

test("reactive values cross custom hooks", () => {
  render(<HookCounter />);
  expect(screen.getByRole("status").textContent).toBe("1 2 4 off");
  fireEvent.click(screen.getByText("inc"));
  fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByRole("status").textContent).toBe("2 4 8 on");
});

test("reactive values received by array destructuring and under a type assertion", () => {
  render(<Paired />);
  expect(screen.getByRole("status").textContent).toBe("1 off");
  fireEvent.click(screen.getByText("inc"));
  fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByRole("status").textContent).toBe("2 on");
});

test("a reactive value is shared through Context", () => {
  render(<Themed />);
  fireEvent.click(screen.getByText("light"));
  expect(screen.getByRole("button").textContent).toBe("dark");
});

test("useReducer and plain values are brought in with From and Of", () => {
  render(<Reduced />);
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("button").textContent).toBe("n=2/2");
});

const Label = ({ text, loud }: { text: string; loud: boolean }) => (
  <b>{loud ? text.toUpperCase() : text}</b>
);

const Profile = () => {
  const name = reactive.new("a");
  const loud = reactive.new(false);
  return (
    <>
      <input aria-label="name" value={name} onChange={(e) => name.set(e.target.value)} />
      <button onClick={() => loud.set(true)} disabled={loud}>
        loud
      </button>
      <Label text={name} loud={loud} />
    </>
  );
};

test("reactive values are used directly in attributes", () => {
  render(<Profile />);
  fireEvent.change(screen.getByLabelText("name"), { target: { value: "bob" } });
  expect((screen.getByLabelText("name") as HTMLInputElement).value).toBe("bob");
  fireEvent.click(screen.getByText("loud"));
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText("BOB")).toBeTruthy();
});

test("Jotai atoms are read as reactive values", () => {
  render(<AtomCounter />);
  expect(screen.getByRole("status").textContent).toBe("0 0 0");
  fireEvent.click(screen.getByText("inc"));
  fireEvent.click(screen.getByText("visit"));
  expect(screen.getByRole("status").textContent).toBe("1 2 2");
  fireEvent.click(screen.getByText("inc"));
  fireEvent.click(screen.getByText("inc"));
  expect((screen.getByText("inc") as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText("reset"));
  expect(screen.getByRole("status").textContent).toBe("0 0 2");
});

test("methods can be chained on a value returned from a hook", () => {
  render(<Chained />);
  expect(screen.getByRole("paragraph").textContent).toBe("off 11 40");
});

const runs: string[] = [];

const Watcher = ({ label }: { label: string }) => {
  const query = reactive.new("a");
  const other = reactive.new(0);
  reactive.effect(() => {
    runs.push("mount");
  });
  reactive.effect(() => {
    const entry = `${label}:${$(query)}`;
    runs.push(`run ${entry}`);
    return () => void runs.push(`cleanup ${entry}`);
  });
  return (
    <>
      <button onClick={() => query.set("b")}>query</button>
      <button onClick={() => other.update((n) => n + 1)}>other</button>
      <output>{other}</output>
    </>
  );
};

test("an effect runs again when a value it reads or a plain prop it uses changes", () => {
  const view = render(<Watcher label="x" />);
  // Without dependencies it runs once on mount
  expect(runs).toEqual(["mount", "run x:a"]);

  // A state the effect does not read
  fireEvent.click(screen.getByText("other"));
  expect(screen.getByRole("status").textContent).toBe("1");
  expect(runs).toEqual(["mount", "run x:a"]);

  // A value read with `$`. The cleanup runs first
  fireEvent.click(screen.getByText("query"));
  expect(runs.slice(2)).toEqual(["cleanup x:a", "run x:b"]);

  // A plain prop
  view.rerender(<Watcher label="y" />);
  expect(runs.slice(4)).toEqual(["cleanup x:b", "run y:b"]);
  view.rerender(<Watcher label="y" />);
  expect(runs).toHaveLength(6);

  view.unmount();
  expect(runs.slice(6)).toEqual(["cleanup y:b"]);
});

// The effect of a custom hook reads a received value and writes to a state
const useHistory = (source: Derived<number>): Derived<string> => {
  const values = reactive.new<number[]>([]);
  reactive.effect(() => {
    const value = $(source);
    values.update((list) => [...list, value]);
  });
  return values.derive((list) => list.join(","));
};

const History = () => {
  const state = reactive.new({ n: 1, other: 0 });
  const n = state.focus("n");
  const history = useHistory(n.derive((value) => value * 10));
  return (
    <>
      <button onClick={() => n.update((value) => value + 1)}>n</button>
      <button onClick={() => state.focus("other").update((value) => value + 1)}>other</button>
      <output>{history}</output>
    </>
  );
};

test("an effect in a custom hook follows a lens and a derived value", () => {
  render(<History />);
  expect(screen.getByRole("status").textContent).toBe("10");
  fireEvent.click(screen.getByText("n"));
  expect(screen.getByRole("status").textContent).toBe("10,20");
  fireEvent.click(screen.getByText("other"));
  expect(screen.getByRole("status").textContent).toBe("10,20");
});

// React titles an updater later when another update is already queued in the same handler.
// The argument of `set` is read at the call, not then

const Signup = () => {
  const touched = reactive.new(false);
  const form = reactive.new({ name: "", email: "" });
  const note = reactive.new("");
  return (
    <>
      <input
        aria-label="name"
        value={form.focus("name")}
        onChange={(e) => {
          touched.set(true);
          form.focus("name").set(e.currentTarget.value);
        }}
      />
      <input
        aria-label="email"
        value={form.focus("email")}
        onChange={(e) => {
          touched.set(true);
          startTransition(() => form.focus("email").set(e.target.value));
        }}
      />
      <button
        onClick={() => {
          let text = "first";
          touched.set(true);
          note.set(text);
          text = "second";
        }}
      >
        note
      </button>
      <output>{form.derive((f) => `${f.name} ${f.email}`)}</output>
      <p>{note}</p>
    </>
  );
};

test("set reads its argument at the call", async () => {
  render(<Signup />);
  // The event's `currentTarget` is null once the handler has returned
  fireEvent.change(screen.getByLabelText("name"), { target: { value: "ann" } });
  expect(screen.getByRole("status").textContent).toBe("ann ");
  // React puts the controlled input back to the old value before a transition renders
  fireEvent.change(screen.getByLabelText("email"), { target: { value: "a@b.c" } });
  await act(async () => {});
  expect(screen.getByRole("status").textContent).toBe("ann a@b.c");
  fireEvent.click(screen.getByText("note"));
  expect(screen.getByRole("paragraph").textContent).toBe("first");
});

const titles: string[] = [];

const Titled = () => {
  const title = reactive.new("a");
  const other = reactive.new(0);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- the lint cannot see into `reactive.handler`
  useEffect(
    reactive.handler(() => void titles.push($(title))),
    [title],
  );
  return (
    <>
      <button onClick={() => title.update((s) => s + "!")}>rename</button>
      <button onClick={() => other.update((n) => n + 1)}>other</button>
      <output>{other}</output>
    </>
  );
};

test("a reactive value is a dependency of a React hook", () => {
  render(<Titled />);
  fireEvent.click(screen.getByText("other"));
  expect(screen.getByRole("status").textContent).toBe("1");
  expect(titles).toEqual(["a"]);
  fireEvent.click(screen.getByText("rename"));
  expect(titles).toEqual(["a", "a!"]);
});

type User = { name: string; visits: number };

const Account = () => {
  const user = reactive.new<User | null>(null);
  return (
    <>
      {user.when((u) => u !== null, {
        narrowed: (u) => (
          <>
            <input
              aria-label="name"
              value={u.focus("name")}
              onChange={(e) => u.focus("name").set(e.target.value)}
            />
            <button onClick={() => u.update((old) => ({ ...old, visits: old.visits + 1 }))}>
              visit
            </button>
            <button
              onClick={() => {
                // The guard is checked again when the update is applied. After the logout it is dropped
                user.set(null);
                u.focus("name").set("ghost");
              }}
            >
              logout
            </button>
            <output>{u.derive((value) => `${value.name}:${value.visits}`)}</output>
          </>
        ),
        rest: (rest) => (
          <button onClick={() => user.set({ name: "a", visits: 0 })}>
            login{rest.derive((value) => String(value))}
          </button>
        ),
      })}
      <p>{user.when((u) => u !== null, { narrowed: (u) => u.focus("name") })}</p>
    </>
  );
};

test("when renders a branch and writes back through the narrowed value", () => {
  render(<Account />);
  expect(screen.getByRole("button").textContent).toBe("loginnull");
  expect(screen.getByRole("paragraph").textContent).toBe("");

  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("status").textContent).toBe("a:0");
  fireEvent.change(screen.getByLabelText("name"), { target: { value: "bob" } });
  fireEvent.click(screen.getByText("visit"));
  fireEvent.click(screen.getByText("visit"));
  expect(screen.getByRole("status").textContent).toBe("bob:2");
  expect(screen.getByRole("paragraph").textContent).toBe("bob");
});

test("an update through a narrowed value is dropped when the guard no longer holds", () => {
  render(<Account />);
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(screen.getByText("logout"));
  expect(screen.getByRole("button").textContent).toBe("loginnull");
  expect(screen.queryByRole("status")).toBeNull();
});

type Remote =
  | { kind: "loading" }
  | { kind: "ok"; items: Todo[]; page: number }
  | { kind: "error"; message: string };

const Feed = () => {
  const remote = reactive.new<Remote>({ kind: "loading" });
  const loaded: Remote = { kind: "ok", items: [{ id: 1, title: "a", done: false }], page: 1 };
  return (
    <>
      <button onClick={() => remote.set(loaded)}>load</button>
      <button onClick={() => remote.set({ kind: "error", message: "boom" })}>fail</button>
      {remote.match("kind", {
        loading: () => <output>loading</output>,
        ok: (s) => (
          <>
            <ul>
              {s.focus("items").each(
                (todo) => todo.id,
                (todo) => (
                  <li onClick={() => todo.focus("done").update((done) => !done)}>
                    {todo.derive((t) => `${t.title}:${t.done}`)}
                  </li>
                ),
              )}
            </ul>
            <button onClick={() => s.focus("page").update((page) => page + 1)}>next</button>
            <button
              onClick={() => {
                // No longer the same case when the update is applied: it is dropped
                remote.set({ kind: "error", message: "late" });
                s.focus("page").update((page) => page + 1);
              }}
            >
              break
            </button>
            <output>{s.derive((value) => `page ${value.page}`)}</output>
          </>
        ),
        error: (s) => <output>{s.derive((value) => value.message)}</output>,
      })}
    </>
  );
};

test("match renders the case of the value and writes back through it", () => {
  render(<Feed />);
  expect(screen.getByRole("status").textContent).toBe("loading");

  fireEvent.click(screen.getByText("load"));
  expect(screen.getByRole("status").textContent).toBe("page 1");
  fireEvent.click(screen.getByText("next"));
  fireEvent.click(screen.getByRole("listitem"));
  expect(screen.getByRole("status").textContent).toBe("page 2");
  expect(screen.getByRole("listitem").textContent).toBe("a:true");

  fireEvent.click(screen.getByText("break"));
  expect(screen.getByRole("status").textContent).toBe("late");
  fireEvent.click(screen.getByText("fail"));
  expect(screen.getByRole("status").textContent).toBe("boom");
});

test("when and each are chained on a value returned from a hook", () => {
  render(
    <>
      <Switch />
      <Names />
    </>,
  );
  expect(screen.getByRole("paragraph").textContent).toBe("no");
  expect(screen.getByRole("list").textContent).toBe("annbob");
});

type Draft = { kind: "empty" } | { kind: "editing"; text: string };

const Composer = () => {
  const draft = reactive.new<Draft>({ kind: "empty" });
  const sent = reactive.new<string | null>(null);
  return (
    <>
      <button
        onClick={() => {
          // Written for what the branches do. Each update is checked again when it is applied
          draft.match("kind", {
            empty: () => draft.set({ kind: "editing", text: "a" }),
            editing: (d) => d.focus("text").update((text) => text + "!"),
          });
        }}
      >
        type
      </button>
      <button
        onClick={() => {
          sent.when((s) => s === null, {
            narrowed: () => sent.set("sent"),
            rest: () => sent.set(null),
          });
        }}
      >
        toggle
      </button>
      <output>
        {draft.derive((d) => (d.kind === "editing" ? d.text : "-"))} {sent.derive(String)}
      </output>
    </>
  );
};

test("when and match are written as statements in a handler", () => {
  render(<Composer />);
  fireEvent.click(screen.getByText("type"));
  fireEvent.click(screen.getByText("type"));
  fireEvent.click(screen.getByText("type"));
  fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByRole("status").textContent).toBe("a!! sent");
  fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByRole("status").textContent).toBe("a!! null");
});
