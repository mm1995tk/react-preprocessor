import { memo } from "react";
import { $, reactive, type Derived, type Reactive } from "react-preprocessor";

type Todo = { id: number; title: string; done: boolean };

// Inline type and destructuring
const Checkbox = ({ checked, label }: { checked: Reactive<boolean>; label: string }) =>
  checked.derive((value) => (
    <label>
      <input type="checkbox" checked={value} onChange={() => checked.update((c) => !c)} />
      {label}
    </label>
  ));

// Type alias in the same file. A read-only value does not receive update
type CountProps = { count: Derived<number>; unit?: string };
const Count = ({ count, unit = "items" }: CountProps) => (
  <p>
    {count} {unit}
  </p>
);

// Interface and the props.xxx form. Passed further down
interface ItemProps {
  todo: Reactive<Todo>;
  "on-remove": () => void;
}
const Item = memo((props: ItemProps) => {
  const title = props.todo.derive((t) => t.title);
  return (
    <li>
      <Checkbox checked={props.todo.focus("done")} label="done" />
      {title}
      <button onClick={() => props.todo.update((t) => ({ ...t, title: "" }))}>clear</button>
      <button onClick={props["on-remove"]}>remove</button>
    </li>
  );
});

// Destructuring in the body
function Summary(props: { todos: Derived<Todo[]>; all: Reactive<Todo[]> }) {
  const { todos, all } = props;
  return (
    <footer>
      <Count count={todos.derive((list) => list.length)} />
      <button onClick={() => all.update(() => [])}>clear all</button>
    </footer>
  );
}

export const App = () => {
  const todos: Reactive<Todo[]> = reactive.new([]);
  const remaining = todos.derive((list) => list.filter((t) => !t.done));
  return (
    <>
      <ul>
        {todos.each(
          (todo) => todo.id,
          (todo) => (
            <Item
              todo={todo}
              on-remove={reactive.handler(() => {
                const { id } = $(todo);
                todos.update((list) => list.filter((x) => x.id !== id));
              })}
            />
          ),
        )}
      </ul>
      <Summary todos={remaining} all={todos} />
    </>
  );
};
