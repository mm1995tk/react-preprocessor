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
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState({
    user: null as User | null,
    remote: {
      kind: "loading"
    } as Remote
  });
  const remote = state.remote;

  // Without `rest`, the false side is `undefined`
  const greeting = user !== null ? `hello, ${user.name}` : undefined;
  return <>
      {user !== null ? <input value={user.name} onChange={e => setUser(prev => prev !== null ? {
      ...prev,
      name: e.target.value
    } : prev)} /> : <button onClick={() => setUser(() => ({
      name: "",
      age: 0
    }))}>login</button>}
      <p>{greeting}</p>
      {state.user !== null ? isAdult(state.user) ? <button onClick={() => setState(prev => ({
      ...prev,
      user: prev.user !== null ? isAdult(prev.user) ? {
        ...prev.user,
        name: "adult"
      } : prev.user : prev.user
    }))}>
                {state.user.name}
              </button> : <i>{state.user.age}</i> : <i>{String(state.user)}</i>}
      {remote.kind === "loading" ? <progress /> : remote.kind === "ok" ? <ul>
            {remote.items.map(item => <li onClick={() => setState(prev => ({
        ...prev,
        remote: prev.remote.kind === "ok" ? {
          ...prev.remote,
          items: prev.remote.items.map(item2 => item2.id === item.id ? {
            ...item2,
            title: item2.title.toUpperCase()
          } : item2)
        } : prev.remote
      }))} key={item.id}>
                  {item.title}
                </li>)}
            <button onClick={() => setState(prev => ({
        ...prev,
        remote: prev.remote.kind === "ok" ? {
          ...prev.remote,
          page: prev.remote.page + 1
        } : prev.remote
      }))}>next</button>
          </ul> : remote.kind === "error" ? <p>{remote.error.message}</p> : undefined}
      {(value2 => value2 !== null ? <b>
              {value2} of {value2}
            </b> : (() => {
      return <b>none</b>;
    })())(remote.kind === "ok" ? remote.items.length : null)}
    </>;
};
