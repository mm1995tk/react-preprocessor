import { reactive, type Reactive } from "react-preprocessor";

type Todo = { id: number; title: string; done: boolean };

const Checkbox = ({ checked }: { checked: Reactive<boolean> }) => (
  <input type="checkbox" checked={checked} onChange={() => checked.update((c) => !c)} />
);

export const Todos = () => {
  const state = reactive.new({
    todos: [
      { id: 1, title: "mark state by its type", done: true },
      { id: 2, title: "write through a lens", done: false },
    ] as Todo[],
    draft: "",
    nextId: 3,
  });
  const todos = state.focus("todos");
  const draft = state.focus("draft");

  const add = () =>
    state.update((s) => ({
      todos: [...s.todos, { id: s.nextId, title: s.draft, done: false }],
      draft: "",
      nextId: s.nextId + 1,
    }));

  return (
    <>
      <input value={draft} onChange={(e) => draft.set(e.target.value)} placeholder="what next?" />
      <button onClick={add}>add</button>
      <ul>
        {todos.each(
          (todo) => todo.id,
          (todo) => (
            <li>
              <label>
                <Checkbox checked={todo.focus("done")} />
                {todo.derive((t) => t.title)}
              </label>
            </li>
          ),
        )}
      </ul>
      <p>{todos.derive((list) => list.filter((t) => !t.done).length)} left</p>
    </>
  );
};
