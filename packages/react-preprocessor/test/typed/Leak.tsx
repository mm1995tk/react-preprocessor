import { useCounter } from "./hooks.ts";

// Passes the type check (console.log takes any), but a reactive value cannot be passed to a function that does not take one
export const Leak = () => {
  const { count } = useCounter(1);
  console.log(count);
  return <>{count}</>;
};
