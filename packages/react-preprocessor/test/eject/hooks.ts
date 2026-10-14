import { reactive, type Derived, type Reactive } from "react-preprocessor";

// Returns reactive values inside an object
export const useCounter = (initial: number) => {
  const count = reactive.new(initial);
  const inc = () => count.update((n) => n + 1);
  return { count, double: count.derive((n) => n * 2), inc };
};

// Takes a reactive value and returns a derived value
export const useDoubled = (source: Derived<number>): Derived<number> => source.derive((n) => n * 2);

// Takes a writable value and returns a handler that updates it
export const useReset = (target: Reactive<number>) => () => target.set(0);

// Returns a writable value as is
export function useToggle(): Reactive<boolean> {
  const on = reactive.new(false);
  return on;
}
