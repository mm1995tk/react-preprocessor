import { useState } from "react";
import { $, reactive, type Derived } from "react-preprocessor";

const format = (n: number): string => n.toFixed(2);

export function Cart(props: { initialQty: number }) {
  const price = reactive.new(100);
  const qty = reactive.new(props.initialQty);
  const [open, setOpen] = useState(false);

  const total: Derived<number> = reactive.derive(() => $(price) * $(qty));
  const label = total.derive(format).derive((s) => `¥${s}`);
  const alias = qty;

  const reset = () => alias.update(() => 0);
  const log = reactive.handler(() => console.log($(total)));

  return price.derive((p) => (
    <section hidden={!open}>
      <input type="number" value={p} onChange={(e) => price.update(() => Number(e.target.value))} />
      <output>{label}</output>
      <button onClick={reset}>reset</button>
      <button onClick={log}>log</button>
      <button onClick={() => setOpen((o) => !o)}>toggle</button>
    </section>
  ));
}
