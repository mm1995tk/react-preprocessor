import { reactive, type Derived, type Reactive } from "react-preprocessor";

// Returns reactive values inside an object
export const useCounter = (initial: number) => {
  const count = reactive.new(initial);
  const inc = () => count.update((n) => n + 1);
  return { count, double: count.derive((n) => n * 2), inc };
};

// Takes a reactive value and returns a derived value
export const useDoubled = (source: Derived<number>): Derived<number> => source.derive((n) => n * 2);

// Returns a writable value as is
export function useToggle(): Reactive<boolean> {
  const on = reactive.new(false);
  return on;
}

// Returns reactive values inside an array
export const usePair = (initial: number): [Reactive<number>, () => void] => {
  const count = reactive.new(initial);
  return [count, () => count.update((n) => n + 1)];
};
