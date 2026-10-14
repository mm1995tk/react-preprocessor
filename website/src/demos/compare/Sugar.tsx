import { $, reactive } from "react-preprocessor";

type Todo = { id: number; title: string; done: boolean };

export const Todos = ({ owner }: { owner: string }) => {
  const todos = reactive.new<Todo[]>([]);
  const left = todos.derive((list) => list.filter((t) => !t.done).length);

  reactive.effect(() => {
    document.title = `${owner}: ${$(left)} left`;
  });

  return (
    <ul>
      {todos.each(
        (todo) => todo.id,
        (todo) => (
          <li onClick={() => todo.focus("done").update((done) => !done)}>
            {todo.derive((t) => t.title)}
          </li>
        ),
      )}
    </ul>
  );
};
