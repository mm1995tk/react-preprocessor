import { useState } from "react";
import type { Derived } from "react-preprocessor";
const format = (n: number): string => n.toFixed(2);
export function Cart(props: {
  initialQty: number;
}) {
  const [price, setPrice] = useState(100);
  const [qty, setQty] = useState(() => props.initialQty);
  const [open, setOpen] = useState(false);
  const total: number = price * qty;
  const label = `¥${format(total)}`;
  const alias = qty;
  const reset = () => setQty(() => 0);
  const log = () => console.log(total);
  return <section hidden={!open}>
      <input type="number" value={price} onChange={e => setPrice(() => Number(e.target.value))} />
      <output>{label}</output>
      <button onClick={reset}>reset</button>
      <button onClick={log}>log</button>
      <button onClick={() => setOpen(o => !o)}>toggle</button>
    </section>;
}
