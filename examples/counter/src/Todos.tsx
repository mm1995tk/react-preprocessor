import { $, reactive, type Derived, type Reactive } from "react-preprocessor";
import type { ItemProps, Todo } from "./types.ts";

const Checkbox = ({ checked }: { checked: Reactive<boolean> }) => (
  <input type="checkbox" checked={checked} onChange={() => checked.update((c) => !c)} />
);

const Item = ({ todo, onRemove }: ItemProps) => (
  <li>
    <Checkbox checked={todo.focus("done")} />
    {todo.derive((t) => t.title)}{" "}
    <button onClick={reactive.handler(() => onRemove($(todo).id))}>remove</button>
  </li>
);

const Remaining = ({ count }: { count: Derived<number> }) => <p>{count} left</p>;

export const Todos = () => {
  const state = reactive.new({ todos: [] as Todo[], draft: "", nextId: 1 });
  const todos = state.focus("todos");
  const draft = state.focus("draft");

  const add = () =>
    state.update((s) => ({
      todos: [...s.todos, { id: s.nextId, title: s.draft, done: false }],
      draft: "",
      nextId: s.nextId + 1,
    }));
  const remove = (id: number) => todos.update((list) => list.filter((t) => t.id !== id));

  return (
    <section>
      <input value={draft} onChange={(e) => draft.set(e.target.value)} />
      <button onClick={add}>add</button>
      <ul>
        {todos.each(
          (todo) => todo.id,
          (todo) => (
            <Item todo={todo} onRemove={remove} />
          ),
        )}
      </ul>
      <Remaining count={todos.derive((list) => list.filter((t) => !t.done).length)} />
    </section>
  );
};
