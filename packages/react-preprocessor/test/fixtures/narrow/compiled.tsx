import { c as _c } from "react/compiler-runtime";
import { useState } from "react";
import type { Derived, Reactive } from "react-preprocessor";
type User = {
  name: string;
  age: number;
};
type Item = {
  id: number;
  title: string;
};
type Remote = {
  kind: "loading";
} | {
  kind: "ok";
  items: Item[];
  page: number;
} | {
  kind: "error";
  error: Error;
};
const isAdult = (user: User): user is User & {
  adult: true;
} => user.age >= 20;
export const Login = () => {
  const $ = _c(20);
  const [user, setUser] = useState(null);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = {
      kind: "loading"
    };
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = {
      user: null as User | null,
      remote: t0 as Remote
    };
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const [state, setState] = useState(t1);
  const remote = state.remote;
  const greeting = user !== null ? `hello, ${user.name}` : undefined;
  let t2;
  if ($[2] !== user) {
    t2 = user !== null ? <input value={user.name} onChange={e => setUser(prev => prev !== null ? {
      ...prev,
      name: e.target.value
    } : prev)} /> : <button onClick={() => setUser(_temp)}>login</button>;
    $[2] = user;
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== greeting) {
    t3 = <p>{greeting}</p>;
    $[4] = greeting;
    $[5] = t3;
  } else {
    t3 = $[5];
  }
  let t4;
  if ($[6] !== state.user) {
    t4 = state.user !== null ? isAdult(state.user) ? <button onClick={() => setState(_temp2)}>{state.user.name}</button> : <i>{state.user.age}</i> : <i>{String(state.user)}</i>;
    $[6] = state.user;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== remote.error || $[9] !== remote.items || $[10] !== remote.kind) {
    t5 = remote.kind === "loading" ? <progress /> : remote.kind === "ok" ? <ul>{remote.items.map(item => <li onClick={() => setState(prev_1 => ({
        ...prev_1,
        remote: prev_1.remote.kind === "ok" ? {
          ...prev_1.remote,
          items: prev_1.remote.items.map(item2 => item2.id === item.id ? {
            ...item2,
            title: item2.title.toUpperCase()
          } : item2)
        } : prev_1.remote
      }))} key={item.id}>{item.title}</li>)}<button onClick={() => setState(_temp3)}>next</button></ul> : remote.kind === "error" ? <p>{remote.error.message}</p> : undefined;
    $[8] = remote.error;
    $[9] = remote.items;
    $[10] = remote.kind;
    $[11] = t5;
  } else {
    t5 = $[11];
  }
  const t6 = remote.kind === "ok" ? remote.items.length : null;
  let t7;
  if ($[12] !== t6) {
    t7 = _temp5(t6);
    $[12] = t6;
    $[13] = t7;
  } else {
    t7 = $[13];
  }
  let t8;
  if ($[14] !== t2 || $[15] !== t3 || $[16] !== t4 || $[17] !== t5 || $[18] !== t7) {
    t8 = <>{t2}{t3}{t4}{t5}{t7}</>;
    $[14] = t2;
    $[15] = t3;
    $[16] = t4;
    $[17] = t5;
    $[18] = t7;
    $[19] = t8;
  } else {
    t8 = $[19];
  }
  return t8;
};
function _temp() {
  return {
    name: "",
    age: 0
  };
}
function _temp2(prev_0) {
  return {
    ...prev_0,
    user: prev_0.user !== null ? isAdult(prev_0.user) ? {
      ...prev_0.user,
      name: "adult"
    } : prev_0.user : prev_0.user
  };
}
function _temp3(prev_2) {
  return {
    ...prev_2,
    remote: prev_2.remote.kind === "ok" ? {
      ...prev_2.remote,
      page: prev_2.remote.page + 1
    } : prev_2.remote
  };
}
function _temp4() {
  return <b>none</b>;
}
function _temp5(value2) {
  return value2 !== null ? <b>{value2} of {value2}</b> : _temp4();
}
