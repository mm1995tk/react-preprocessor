import { useState } from "react";
import type { Derived, Reactive } from "react-preprocessor";

// Returns reactive values inside an object
export const useCounter = (initial: number) => {
  const [count, setCount] = useState(() => initial);
  const inc = () => setCount(n => n + 1);
  return {
    count: {
      value: count,
      update: setCount
    },
    double: {
      value: count * 2
    },
    inc
  };
};

// Takes a reactive value and returns a derived value
export const useDoubled = ({
  value: source
}: Derived<number>): Derived<number> => ({
  value: source * 2
});

// Returns a writable value as is
export function useToggle(): Reactive<boolean> {
  const [on, setOn] = useState(false);
  return {
    value: on,
    update: setOn
  };
}
