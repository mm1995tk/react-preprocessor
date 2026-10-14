import { $, reactive, type Reactive } from "react-preprocessor";
import { Todos } from "./Todos.tsx";

const Counter = () => {
  const cnt: Reactive<number> = reactive.new(0);
  const double = cnt.derive((n) => n * 2);
  return (
    <p>
      now: {cnt} / double: {double} <button onClick={() => cnt.update((n) => n + 1)}>inc</button>
    </p>
  );
};

const Cart = () => {
  const price = reactive.new(100);
  const qty = reactive.new(1);
  const total = reactive.derive(() => $(price) * $(qty));

  return (
    <p>
      <input type="number" value={price} onChange={(e) => price.set(e.target.valueAsNumber)} />
      {" × "}
      <input type="number" value={qty} onChange={(e) => qty.set(e.target.valueAsNumber)} />
      {" = "}
      <output>{total}</output>
    </p>
  );
};

export const App = () => (
  <main>
    <h1>react-preprocessor</h1>
    <Counter />
    <Cart />
    <Todos />
  </main>
);
