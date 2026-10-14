import { c as _c } from "react/compiler-runtime";
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
  const $ = _c(20);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = {
      todos: [],
      draft: "",
      "next-id": 1
    };
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [state, setState] = useState(t0);
  const todos = state.todos;
  const draft = state.draft;
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => setState(_temp);
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const add = t1;
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = e => setState(prev => ({
      ...prev,
      draft: e.target.value
    }));
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== draft) {
    t3 = <input value={draft} onChange={t2} />;
    $[3] = draft;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  let t5;
  if ($[5] === Symbol.for("react.memo_cache_sentinel")) {
    t4 = <button onClick={add}>add</button>;
    t5 = <button onClick={() => setState(_temp2)}>skip</button>;
    $[5] = t4;
    $[6] = t5;
  } else {
    t4 = $[5];
    t5 = $[6];
  }
  let t6;
  if ($[7] !== todos) {
    let t7;
    if ($[9] === Symbol.for("react.memo_cache_sentinel")) {
      t7 = todo => <li key={todo.id}><input type="checkbox" checked={todo.done} onChange={() => setState(prev_1 => ({
          ...prev_1,
          todos: prev_1.todos.map(item => item.id === todo.id ? {
            ...item,
            done: !item.done
          } : item)
        }))} />{todo.title}<button onClick={() => setState(prev_2 => ({
          ...prev_2,
          todos: prev_2.todos.map(item_0 => item_0.id === todo.id ? {
            ...item_0,
            title: item_0.title.toUpperCase()
          } : item_0)
        }))}>shout</button><button onClick={() => {
          const {
            id
          } = todo;
          setState(prev_3 => ({
            ...prev_3,
            todos: prev_3.todos.filter(x => x.id !== id)
          }));
        }}>remove</button></li>;
      $[9] = t7;
    } else {
      t7 = $[9];
    }
    t6 = todos.map(t7);
    $[7] = todos;
    $[8] = t6;
  } else {
    t6 = $[8];
  }
  let t7;
  if ($[10] !== t6) {
    t7 = <ul>{t6}</ul>;
    $[10] = t6;
    $[11] = t7;
  } else {
    t7 = $[11];
  }
  let t8;
  if ($[12] !== todos) {
    t8 = todos.filter(_temp3);
    $[12] = todos;
    $[13] = t8;
  } else {
    t8 = $[13];
  }
  let t9;
  if ($[14] !== t8.length) {
    t9 = <p>{t8.length} left</p>;
    $[14] = t8.length;
    $[15] = t9;
  } else {
    t9 = $[15];
  }
  let t10;
  if ($[16] !== t3 || $[17] !== t7 || $[18] !== t9) {
    t10 = <>{t3}{t4}{t5}{t7}{t9}</>;
    $[16] = t3;
    $[17] = t7;
    $[18] = t9;
    $[19] = t10;
  } else {
    t10 = $[19];
  }
  return t10;
};
function _temp(s) {
  return {
    todos: [...s.todos, {
      id: s["next-id"],
      title: s.draft,
      done: false
    }],
    draft: "",
    "next-id": s["next-id"] + 1
  };
}
function _temp2(prev_0) {
  return {
    ...prev_0,
    "next-id": prev_0["next-id"] + 100
  };
}
function _temp3(t) {
  return !t.done;
}
