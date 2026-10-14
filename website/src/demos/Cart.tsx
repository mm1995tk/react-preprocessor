import { $, reactive } from "react-preprocessor";

export const Cart = () => {
  const price = reactive.new(100);
  const qty = reactive.new(2);
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
