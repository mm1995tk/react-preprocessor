import { useEffect } from "react";
import { useImmer } from "use-immer";

type Todo = { id: number; title: string; done: boolean };

export const Todos = ({ owner }: { owner: string }) => {
  const [todos, updateTodos] = useImmer<Todo[]>([]);
  const left = todos.filter((t) => !t.done).length;

  useEffect(() => {
    document.title = `${owner}: ${left} left`;
  }, [owner, left]);

  const toggle = (id: number) =>
    updateTodos((draft) => {
      const todo = draft.find((t) => t.id === id);
      if (todo) todo.done = !todo.done;
    });

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
