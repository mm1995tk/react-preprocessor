import { useToggle } from "./hooks.ts";

// Passes the type check, but `let` is not unpacked: `on` would stay `{ value, update }` at runtime
export const Boxed = () => {
  let on = useToggle();
  return <>{on}</>;
};
