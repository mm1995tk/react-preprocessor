import { createContext, useContext, useReducer } from "react";
import { $, reactive, type Reactive } from "react-preprocessor";
import { useCounter, useDoubled, useToggle } from "./hooks.ts";

// Passing values to and from custom hooks
export const Counter = () => {
  const { count, double, inc } = useCounter(1);
  const quad = useDoubled(double);
  const on = useToggle();
  return (
    <>
      <output>
        {count} {double} {quad} {on.derive((value) => (value ? "on" : "off"))}
      </output>
      <button onClick={inc}>inc</button>
      <button onClick={() => on.update((value) => !value)}>toggle</button>
    </>
  );
};

// Methods are chained directly on the received value. No variable is needed
export const Chained = () => {
  const label = useToggle().derive((on) => (on ? "on" : "off"));
  return (
    <p>
      {label} {useCounter(5).double.derive((n) => n + 1)} {$(useDoubled(useCounter(2).count)) * 10}
    </p>
  );
};

// Provided through Context
const Theme = createContext<Reactive<string>>(null!);

const ThemeButton = () => {
  const theme = useContext(Theme);
  return (
    <button onClick={() => theme.update((t) => (t === "light" ? "dark" : "light"))}>{theme}</button>
  );
};

export const Themed = () => {
  const theme = reactive.new("light");
  return (
    <Theme value={theme}>
      <ThemeButton />
    </Theme>
  );
};

// Bringing in useReducer and a plain value
type Action = { type: "apply"; f: (n: number) => number };
const reducer = (state: number, action: Action): number => action.f(state);

export const Reduced = () => {
  const [state, dispatch] = useReducer(reducer, 0);
  const n = reactive.from(state, (f) => dispatch({ type: "apply", f }));
  const label = reactive.of(`n=${state}`);
  return (
    <button onClick={() => n.update((value) => value + 1)}>
      {label}/{n}
    </button>
  );
};
