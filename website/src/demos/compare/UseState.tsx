import { useEffect, useState } from "react";

type Todo = { id: number; title: string; done: boolean };

export const Todos = ({ owner }: { owner: string }) => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const left = todos.filter((t) => !t.done).length;

  useEffect(() => {
    document.title = `${owner}: ${left} left`;
  }, [owner, left]);

  const toggle = (id: number) =>
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id} onClick={() => toggle(todo.id)}>
          {todo.title}
        </li>
      ))}
    </ul>
  );
};
