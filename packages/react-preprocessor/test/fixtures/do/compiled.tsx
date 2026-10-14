import { c as _c } from "react/compiler-runtime";
import { useState } from "react";
export const Total = () => {
  const $ = _c(7);
  const [price] = useState(100);
  const [qty] = useState(1);
  const total = price * qty;
  let t0;
  bb0: {
    const value = total;
    if (value > 1000) {
      t0 = "expensive";
      break bb0;
    }
    t0 = "cheap";
  }
  const summary = t0;
  const twice = total * 2;
  let t1;
  if ($[0] !== qty) {
    t1 = qty > 0 ? <b>in cart</b> : null;
    $[0] = qty;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== summary || $[3] !== t1 || $[4] !== total || $[5] !== twice) {
    t2 = <p>{total} {summary} {twice}{t1}</p>;
    $[2] = summary;
    $[3] = t1;
    $[4] = total;
    $[5] = twice;
    $[6] = t2;
  } else {
    t2 = $[6];
  }
  return t2;
};
