import { useState } from "react";
import { createContext, useContext, useReducer } from "react";
import type { Reactive } from "react-preprocessor";
import { useCounter, useDoubled, useToggle } from "./hooks.ts";

// Passing values to and from custom hooks
export const Counter = () => {
  const {
    count: {
      value: count
    },
    double: {
      value: double
    },
    inc
  } = useCounter(1);
  const {
    value: quad
  } = useDoubled({
    value: double
  });
  const {
    value: on,
    update: setOn
  } = useToggle();
  return <>
      <output>
        {count} {double} {quad} {on ? "on" : "off"}
      </output>
      <button onClick={inc}>inc</button>
      <button onClick={() => setOn(value => !value)}>toggle</button>
    </>;
};

// Methods are chained directly on the received value. No variable is needed
export const Chained = () => {
  const label = useToggle().value ? "on" : "off";
  return <p>
      {label} {useCounter(5).double.value + 1} {useDoubled(useCounter(2).count).value * 10}
    </p>;
};

// Provided through Context
const Theme = createContext<Reactive<string>>(null!);
const ThemeButton = () => {
  const {
    value: theme,
    update: setTheme
  } = useContext(Theme);
  return <button onClick={() => setTheme(t => t === "light" ? "dark" : "light")}>{theme}</button>;
};
export const Themed = () => {
  const [theme, setTheme2] = useState("light");
  return <Theme value={{
    value: theme,
    update: setTheme2
  }}>
      <ThemeButton />
    </Theme>;
};

// Bringing in useReducer and a plain value
type Action = {
  type: "apply";
  f: (n: number) => number;
};
const reducer = (state: number, action: Action): number => action.f(state);
export const Reduced = () => {
  const [state, dispatch] = useReducer(reducer, 0);
  const n = state,
    setN: (f: (old: typeof n) => typeof n) => void = f => dispatch({
      type: "apply",
      f
    });
  const label = `n=${state}`;
  return <button onClick={() => setN(value => value + 1)}>
      {label}/{n}
    </button>;
};
