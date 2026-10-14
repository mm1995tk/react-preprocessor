import { reactive, type Derived } from "react-preprocessor";
import { useToggle } from "./hooks.ts";

const useNames = (): Derived<string[]> => reactive.of(["ann", "bob"]);

// `when` and `each` are chained directly on the value a hook returns, and their functions return reactive values
export const Switch = () => (
  <p>
    {useToggle().when((on): on is true => on, {
      narrowed: (on) => on.derive((value) => (value ? "yes" : "no")),
      rest: (off) => off.derive((value) => (value ? "yes" : "no")),
    })}
  </p>
);

export const Names = () => (
  <ul>
    {useNames().each(
      (name) => name,
      (name) => name.derive((value) => <li>{value}</li>),
    )}
  </ul>
);
