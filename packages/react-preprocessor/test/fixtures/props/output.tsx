import { useState } from "react";
import { memo } from "react";
import type { Derived, Reactive } from "react-preprocessor";
type Todo = {
  id: number;
  title: string;
  done: boolean;
};

// Inline type and destructuring
const Checkbox = ({
  checked: {
    value: checked,
    update: setChecked
  },
  label
}: {
  checked: Reactive<boolean>;
  label: string;
}) => <label>
      <input type="checkbox" checked={checked} onChange={() => setChecked(c => !c)} />
      {label}
    </label>;

// Type alias in the same file. A read-only value does not receive update
type CountProps = {
  count: Derived<number>;
  unit?: string;
};
const Count = ({
  count: {
    value: count
  },
  unit = "items"
}: CountProps) => <p>
    {count} {unit}
  </p>;

// Interface and the props.xxx form. Passed further down
interface ItemProps {
  todo: Reactive<Todo>;
  "on-remove": () => void;
}
const Item = memo((props: ItemProps) => {
  const title = props.todo.value.title;
  return <li>
      <Checkbox checked={{
      value: props.todo.value.done,
      update: f => props.todo.update(prev => ({
        ...prev,
        done: f(prev.done)
      }))
    }} label="done" />
      {title}
      <button onClick={() => props.todo.update(t => ({
      ...t,
      title: ""
    }))}>clear</button>
      <button onClick={props["on-remove"]}>remove</button>
    </li>;
});

// Destructuring in the body
function Summary(props: {
  todos: Derived<Todo[]>;
  all: Reactive<Todo[]>;
}) {
  const {
    todos: {
      value: todos
    },
    all: {
      value: all,
      update: setAll
    }
  } = props;
  return <footer>
      <Count count={{
      value: todos.length
    }} />
      <button onClick={() => setAll(() => [])}>clear all</button>
    </footer>;
}
export const App = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const remaining = todos.filter(t => !t.done);
  return <>
      <ul>
        {todos.map(todo => <Item todo={{
        value: todo,
        update: f => setTodos(prev => prev.map(item => item.id === todo.id ? f(item) : item))
      }} on-remove={() => {
        const {
          id
        } = todo;
        setTodos(list => list.filter(x => x.id !== id));
      }} key={todo.id} />)}
      </ul>
      <Summary todos={{
      value: remaining
    }} all={{
      value: todos,
      update: setTodos
    }} />
    </>;
};
