import { c as _c } from "react/compiler-runtime";
import { useState } from "react";
import type { Reactive } from "react-preprocessor";
const Button = t0 => {
  const $ = _c(3);
  const {
    disabled,
    label
  } = t0;
  let t1;
  if ($[0] !== disabled || $[1] !== label) {
    t1 = <button disabled={disabled}>{label}</button>;
    $[0] = disabled;
    $[1] = label;
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  return t1;
};
const Checkbox = t0 => {
  const $ = _c(5);
  const {
    checked: t1
  } = t0;
  const {
    value: checked,
    update: setChecked
  } = t1;
  let t2;
  if ($[0] !== setChecked) {
    t2 = () => setChecked(_temp);
    $[0] = setChecked;
    $[1] = t2;
  } else {
    t2 = $[1];
  }
  let t3;
  if ($[2] !== checked || $[3] !== t2) {
    t3 = <input type="checkbox" checked={checked} onChange={t2} />;
    $[2] = checked;
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  return t3;
};
const Field = t0 => {
  const $ = _c(5);
  const {
    onText,
    onClear
  } = t0;
  let t1;
  if ($[0] !== onText) {
    t1 = e => onText(e.target.value);
    $[0] = onText;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  let t2;
  if ($[2] !== onClear || $[3] !== t1) {
    t2 = <input onChange={t1} onBlur={onClear} />;
    $[2] = onClear;
    $[3] = t1;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
};
export const Form = () => {
  const $ = _c(20);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [agreed, setAgreed] = useState(false);
  let t0;
  if ($[0] !== text) {
    t0 = text.trim();
    $[0] = text;
    $[1] = t0;
  } else {
    t0 = $[1];
  }
  const empty = t0 === "";
  let t1;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = () => {
      setPending(_temp2);
      setText(_temp3);
    };
    $[2] = t1;
  } else {
    t1 = $[2];
  }
  const submit = t1;
  let t2;
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = e => (next => setText(() => next))(e.target.value);
    $[3] = t2;
  } else {
    t2 = $[3];
  }
  let t3;
  if ($[4] !== pending || $[5] !== text) {
    t3 = <input value={text} onChange={t2} disabled={pending} />;
    $[4] = pending;
    $[5] = text;
    $[6] = t3;
  } else {
    t3 = $[6];
  }
  let t4;
  if ($[7] !== empty) {
    t4 = <Button disabled={empty} label="send" />;
    $[7] = empty;
    $[8] = t4;
  } else {
    t4 = $[8];
  }
  let t5;
  if ($[9] !== agreed) {
    t5 = <Checkbox checked={{
      value: agreed,
      update: setAgreed
    }} />;
    $[9] = agreed;
    $[10] = t5;
  } else {
    t5 = $[10];
  }
  let t6;
  if ($[11] === Symbol.for("react.memo_cache_sentinel")) {
    t6 = <Field onText={next_0 => setText(() => next_0)} onClear={() => setText(_temp4)} />;
    $[11] = t6;
  } else {
    t6 = $[11];
  }
  let t7;
  if ($[12] !== pending || $[13] !== text) {
    t7 = <output aria-busy={pending}>{text}</output>;
    $[12] = pending;
    $[13] = text;
    $[14] = t7;
  } else {
    t7 = $[14];
  }
  let t8;
  if ($[15] !== t3 || $[16] !== t4 || $[17] !== t5 || $[18] !== t7) {
    t8 = <form onSubmit={submit}>{t3}{t4}{t5}{t6}{t7}</form>;
    $[15] = t3;
    $[16] = t4;
    $[17] = t5;
    $[18] = t7;
    $[19] = t8;
  } else {
    t8 = $[19];
  }
  return t8;
};
function _temp(c) {
  return !c;
}
function _temp2() {
  return true;
}
function _temp3() {
  return "";
}
function _temp4() {
  return "";
}
