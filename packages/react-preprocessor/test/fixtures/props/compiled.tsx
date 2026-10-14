import { c as _c } from "react/compiler-runtime";
import { useState } from "react";
import { memo } from "react";
import type { Derived, Reactive } from "react-preprocessor";
type Todo = {
  id: number;
  title: string;
  done: boolean;
};

// Inline type and destructuring
const Checkbox = t0 => {
  const $ = _c(8);
  const {
    checked: t1,
    label
  } = t0;
  const {
    value: checked,
    update: setChecked
  } = t1;
  let t2;
  if ($[0] !== setChecked) {
    t2 = () => setChecked(_temp);
    $[0] = setChecked;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== checked || $[3] !== t2) {
    t3 = <input type="checkbox" checked={checked} onChange={t2} />;
    $[2] = checked;
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== label || $[6] !== t3) {
    t4 = <label>{t3}{label}</label>;
    $[5] = label;
    $[6] = t3;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  return t4;
};

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
const Item = memo(props => {
  const $ = _c(14);
  const title = props.todo.value.title;
  let t0;
  if ($[0] !== props.todo) {
    t0 = f => props.todo.update(prev => ({
      ...prev,
      done: f(prev.done)
    }));
    $[0] = props.todo;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  let t1;
  if ($[2] !== props.todo.value.done || $[3] !== t0) {
    t1 = <Checkbox checked={{
      value: props.todo.value.done,
      update: t0
    }} label="done" />;
    $[2] = props.todo.value.done;
    $[3] = t0;
    $[4] = t1;
  } else {
    t1 = $[4];
  }
  let t2;
  if ($[5] !== props.todo) {
    t2 = <button onClick={() => props.todo.update(_temp2)}>clear</button>;
    $[5] = props.todo;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  const t3 = props["on-remove"];
  let t4;
  if ($[7] !== t3) {
    t4 = <button onClick={t3}>remove</button>;
    $[7] = t3;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  let t5;
  if ($[9] !== t1 || $[10] !== t2 || $[11] !== t4 || $[12] !== title) {
    t5 = <li>{t1}{title}{t2}{t4}</li>;
    $[9] = t1;
    $[10] = t2;
    $[11] = t4;
    $[12] = title;
    $[13] = t5;
  } else {
    t5 = $[13];
  }
  return t5;
});

// Destructuring in the body
function Summary(props) {
  const $ = _c(7);
  const {
    todos: t0,
    all: t1
  } = props;
  const {
    value: todos
  } = t0;
  const {
    update: setAll
  } = t1;
  let t2;
  if ($[0] !== todos.length) {
    t2 = <Count count={{
      value: todos.length
    }} />;
    $[0] = todos.length;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== setAll) {
    t3 = <button onClick={() => setAll(_temp3)}>clear all</button>;
    $[2] = setAll;
    $[3] = t3;
  } else {
    t3 = $[3];
  }
  let t4;
  if ($[4] !== t2 || $[5] !== t3) {
    t4 = <footer>{t2}{t3}</footer>;
    $[4] = t2;
    $[5] = t3;
    $[6] = t4;
  } else {
    t4 = $[6];
  }
  return t4;
}
function _temp3() {
  return [];
}
export const App = () => {
  const $ = _c(18);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = [];
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [todos, setTodos] = useState(t0);
  let t1;
  if ($[1] !== todos) {
    t1 = todos.filter(_temp4);
    $[1] = todos;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const remaining = t1;
  let t2;
  if ($[3] !== todos) {
    let t3;
    if ($[5] === Symbol.for("react.memo_cache_sentinel")) {
      t3 = todo => <Item todo={{
        value: todo,
        update: f => setTodos(prev => prev.map(item => item.id === todo.id ? f(item) : item))
      }} on-remove={() => {
        const {
          id
        } = todo;
        setTodos(list => list.filter(x => x.id !== id));
      }} key={todo.id} />;
      $[5] = t3;
    } else {
      t3 = $[5];
    }
    t2 = todos.map(t3);
    $[3] = todos;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  let t3;
  if ($[6] !== t2) {
    t3 = <ul>{t2}</ul>;
    $[6] = t2;
    $[7] = t3;
  } else {
    t3 = $[7];
  }
  let t4;
  if ($[8] !== remaining) {
    t4 = {
      value: remaining
    };
    $[8] = remaining;
    $[9] = t4;
  } else {
    t4 = $[9];
  }
  let t5;
  if ($[10] !== todos) {
    t5 = {
      value: todos,
      update: setTodos
    };
    $[10] = todos;
    $[11] = t5;
  } else {
    t5 = $[11];
  }
  let t6;
  if ($[12] !== t4 || $[13] !== t5) {
    t6 = <Summary todos={t4} all={t5} />;
    $[12] = t4;
    $[13] = t5;
    $[14] = t6;
  } else {
    t6 = $[14];
  }
  let t7;
  if ($[15] !== t3 || $[16] !== t6) {
    t7 = <>{t3}{t6}</>;
    $[15] = t3;
    $[16] = t6;
    $[17] = t7;
  } else {
    t7 = $[17];
  }
  return t7;
};
function _temp(c) {
  return !c;
}
function _temp2(t) {
  return {
    ...t,
    title: ""
  };
}
function _temp4(t) {
  return !t.done;
}
