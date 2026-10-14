import { reactive, type Reactive } from "react-preprocessor";
import { Item, Title } from "../typed/Item.tsx";
import type { Todo } from "../typed/types.ts";

// Props with an inline type
const Checkbox = ({ checked }: { checked: Reactive<boolean> }) =>
  checked.derive((value) => (
    <input type="checkbox" checked={value} onChange={() => checked.update((c) => !c)} />
  ));

// Passes reactive values to components whose props type lives in another file
export const App = () => {
  const todos = reactive.new<Todo[]>([]);
  const remaining = todos.derive((list) => list.filter((t) => !t.done).length);
  return (
    <ul>
      {todos.each(
        (todo) => todo.id,
        (todo) => (
          <section>
            <Item
              todo={todo}
              count={remaining}
              label="todo"
              onRemove={(id) => todos.update((list) => list.filter((t) => t.id !== id))}
            />
            <Title todo={todo} label="title" />
            <Checkbox checked={todo.focus("done")} />
          </section>
        ),
      )}
    </ul>
  );
};
