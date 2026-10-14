import { c as _c } from "react/compiler-runtime";
import { useState } from "react";
import type { Reactive } from "react-preprocessor";
export const Counter = () => {
  const $ = _c(4);
  const [cnt, setCnt] = useState(0);
  const double = cnt * 2;
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <button onClick={() => setCnt(_temp)}>inc</button>;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  let t1;
  if ($[1] !== cnt || $[2] !== double) {
    t1 = <>now: {cnt} / double: {double}{t0}</>;
    $[1] = cnt;
    $[2] = double;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  return t1;
};
function _temp(n) {
  return n + 1;
}
