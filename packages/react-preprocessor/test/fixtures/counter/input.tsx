import { reactive, type Reactive } from "react-preprocessor";

export const Counter = () => {
  const cnt: Reactive<number> = reactive.new(0);
  const double = cnt.derive((n) => n * 2);
  return (
    <>
      now: {cnt} / double: {double}
      <button onClick={() => cnt.update((n) => n + 1)}>inc</button>
    </>
  );
};
