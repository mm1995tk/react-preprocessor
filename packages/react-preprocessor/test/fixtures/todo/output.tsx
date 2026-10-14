import { useState } from "react";
import type { Reactive } from "react-preprocessor";
type Todo = {
  id: number;
  title: string;
  done: boolean;
};
type State = {
  todos: Todo[];
  draft: string;
  "next-id": number;
};
export const TodoApp = () => {
  const [state, setState] = useState<State>({
    todos: [],
    draft: "",
    "next-id": 1
  });
  const todos = state.todos;
  const draft = state.draft;
  const add = () => setState(s => ({
    todos: [...s.todos, {
      id: s["next-id"],
      title: s.draft,
      done: false
    }],
    draft: "",
    "next-id": s["next-id"] + 1
  }));
  return <>
      {<input value={draft} onChange={e => setState(prev => ({
      ...prev,
      draft: e.target.value
    }))} />}
      <button onClick={add}>add</button>
      <button onClick={() => setState(prev => ({
      ...prev,
      "next-id": prev["next-id"] + 100
    }))}>skip</button>
      <ul>
        {todos.map(todo => <li key={todo.id}>
              {<input type="checkbox" checked={todo.done} onChange={() => setState(prev => ({
          ...prev,
          todos: prev.todos.map(item => item.id === todo.id ? {
            ...item,
            done: !item.done
          } : item)
        }))} />}
              {todo.title}
              <button onClick={() => setState(prev => ({
          ...prev,
          todos: prev.todos.map(item => item.id === todo.id ? {
            ...item,
            title: item.title.toUpperCase()
          } : item)
        }))}>
                shout
              </button>
              <button onClick={() => {
          const {
            id
          } = todo;
          setState(prev => ({
            ...prev,
            todos: prev.todos.filter(x => x.id !== id)
          }));
        }}>
                remove
              </button>
            </li>)}
      </ul>
      <p>{todos.filter(t => !t.done).length} left</p>
    </>;
};
