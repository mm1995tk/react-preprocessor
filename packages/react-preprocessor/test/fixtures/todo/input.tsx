import { $, reactive, type Reactive } from "react-preprocessor";

type Todo = { id: number; title: string; done: boolean };
type State = { todos: Todo[]; draft: string; "next-id": number };

export const TodoApp = () => {
  const state: Reactive<State> = reactive.new({ todos: [], draft: "", "next-id": 1 });
  const todos = state.focus("todos");
  const draft = state.focus("draft");

  const add = () =>
    state.update((s) => ({
      todos: [...s.todos, { id: s["next-id"], title: s.draft, done: false }],
      draft: "",
      "next-id": s["next-id"] + 1,
    }));

  return (
    <>
      {draft.derive((value) => (
        <input value={value} onChange={(e) => draft.update(() => e.target.value)} />
      ))}
      <button onClick={add}>add</button>
      <button onClick={() => state.focus("next-id").update((n) => n + 100)}>skip</button>
      <ul>
        {todos.each(
          (todo) => todo.id,
          (todo: Reactive<Todo>) => (
            <li>
              {todo.focus("done").derive((done) => (
                <input
                  type="checkbox"
                  checked={done}
                  onChange={() => todo.focus("done").update((d) => !d)}
                />
              ))}
              {todo.derive((t) => t.title)}
              <button onClick={() => todo.update((t) => ({ ...t, title: t.title.toUpperCase() }))}>
                shout
              </button>
              <button onClick={reactive.handler(() => {
                const { id } = $(todo);
                todos.update((list) => list.filter((x) => x.id !== id));
              })}>
                remove
              </button>
            </li>
          ),
        )}
      </ul>
      <p>{todos.derive((list) => list.filter((t) => !t.done).length)} left</p>
    </>
  );
};
