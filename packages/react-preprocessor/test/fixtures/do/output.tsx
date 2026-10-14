import { useState } from "react";
export const Total = () => {
  const [price] = useState(100);
  const [qty] = useState(1);
  const total = price * qty;
  const summary = (() => {
    const value = total;
    if (value > 1000) return "expensive";
    return "cheap";
  })();
  const twice = total * 2;
  return <p>
      {total} {summary} {twice}
      {qty > 0 ? <b>in cart</b> : null}
    </p>;
};
