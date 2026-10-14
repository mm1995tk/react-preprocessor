import { c as _c } from "react/compiler-runtime";
import { useState } from "react";
import type { Derived } from "react-preprocessor";
const format = (n: number): string => n.toFixed(2);
export function Cart(props) {
  const $ = _c(21);
  const [price, setPrice] = useState(100);
  let t0;
  if ($[0] !== props.initialQty) {
    t0 = () => props.initialQty;
    $[0] = props.initialQty;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  const [qty, setQty] = useState(t0);
  const [open, setOpen] = useState(false);
  const total = price * qty;
  let t1;
  if ($[2] !== total) {
    t1 = format(total);
    $[2] = total;
    $[3] = t1;
  } else {
    t1 = $[3];
  }
  const label = `¥${t1}`;
  let t2;
  if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => setQty(_temp);
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  const reset = t2;
  let t3;
  if ($[5] !== total) {
    t3 = () => console.log(total);
    $[5] = total;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  const log = t3;
  const t4 = !open;
  let t5;
  if ($[7] === Symbol.for("react.memo_cache_sentinel")) {
    t5 = e => setPrice(() => Number(e.target.value));
    $[7] = t5;
  } else {
    t5 = $[7];
  }
  let t6;
  if ($[8] !== price) {
    t6 = <input type="number" value={price} onChange={t5} />;
    $[8] = price;
    $[9] = t6;
  } else {
    t6 = $[9];
  }
  let t7;
  if ($[10] !== label) {
    t7 = <output>{label}</output>;
    $[10] = label;
    $[11] = t7;
  } else {
    t7 = $[11];
  }
  let t8;
  if ($[12] === Symbol.for("react.memo_cache_sentinel")) {
    t8 = <button onClick={reset}>reset</button>;
    $[12] = t8;
  } else {
    t8 = $[12];
  }
  let t9;
  if ($[13] !== log) {
    t9 = <button onClick={log}>log</button>;
    $[13] = log;
    $[14] = t9;
  } else {
    t9 = $[14];
  }
  let t10;
  if ($[15] === Symbol.for("react.memo_cache_sentinel")) {
    t10 = <button onClick={() => setOpen(_temp2)}>toggle</button>;
    $[15] = t10;
  } else {
    t10 = $[15];
  }
  let t11;
  if ($[16] !== t4 || $[17] !== t6 || $[18] !== t7 || $[19] !== t9) {
    t11 = <section hidden={t4}>{t6}{t7}{t8}{t9}{t10}</section>;
    $[16] = t4;
    $[17] = t6;
    $[18] = t7;
    $[19] = t9;
    $[20] = t11;
  } else {
    t11 = $[20];
  }
  return t11;
}
function _temp2(o) {
  return !o;
}
function _temp() {
  return 0;
}
