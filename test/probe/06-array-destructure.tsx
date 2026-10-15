import { reactive } from "react-preprocessor";
import type { Reactive } from "react-preprocessor";

export const usePair = (): [Reactive<number>, number] => {
  const cnt = reactive.new(0);
  return [cnt, 1];
};
export const useOne = (): Reactive<number> => { const c = reactive.new(0); return c; };

export const Pair = () => {
  const [cnt] = usePair();
  const asserted = useOne() as Reactive<number>;
  const bang = useOne()!;
  let mutable = useOne();
  const cond = Math.random() > 0.5 ? useOne() : useOne();
  return (
    <>
      {cnt}
      {asserted}
      {bang}
      {mutable}
      {cond}
      <button onClick={() => cnt.update((n) => n + 1)} />
      <button onClick={() => asserted.update((n) => n + 1)} />
    </>
  );
};
