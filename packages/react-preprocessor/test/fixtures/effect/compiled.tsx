import { c as _c } from "react/compiler-runtime";
import { useEffect, useState } from "react";
import { useReducer } from "react";
import type { Derived, Reactive } from "react-preprocessor";
declare const search: (query: string, page: number, signal: AbortSignal) => Promise<string[]>;
const PREFIX = "app";

// A custom hook that takes a reactive value and a plain value
export const useTitle = (t0, suffix) => {
  const $ = _c(4);
  const {
    value: title
  } = t0;
  let t1;
  let t2;
  if ($[0] !== suffix || $[1] !== title) {
    t1 = () => {
      document.title = `${PREFIX}: ${title}${suffix}`;
    };
    t2 = [title, suffix];
    $[0] = suffix;
    $[1] = title;
    $[2] = t1;
    $[3] = t2;
  } else {
    t1 = $[2];
    t2 = $[3];
  }
  useEffect(t1, t2);
};
export function Search(props) {
  const $ = _c(23);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = {
      page: 1,
      size: 20
    };
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  const [state, setState] = useState(t0);
  let t1;
  if ($[1] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = [];
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const [results, setResults] = useState(t1);
  const count = results.length;
  const online = navigator.onLine;
  const [ticks, tick] = useReducer(_temp, 0);
  const clock = ticks;
  let t2;
  if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => tick();
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  const setClock = t2;
  const log = _temp2;
  let t3;
  let t4;
  if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
    t3 = () => {
      const id = setInterval(() => setClock(_temp3), 1000);
      return () => clearInterval(id);
    };
    t4 = [setClock];
    $[3] = t3;
    $[4] = t4;
  } else {
    t3 = $[3];
    t4 = $[4];
  }
  useEffect(t3, t4);
  let t5;
  let t6;
  if ($[5] !== props.limit || $[6] !== props.query.value || $[7] !== state.page) {
    t5 = () => {
      const controller = new AbortController();
      search(props.query.value, state.page, controller.signal).then(found => {
        (next => setResults(() => next))(found.slice(0, props.limit));
        setState(_temp4);
      });
      return () => controller.abort();
    };
    t6 = [props.query.value, state.page, props.limit];
    $[5] = props.limit;
    $[6] = props.query.value;
    $[7] = state.page;
    $[8] = t5;
    $[9] = t6;
  } else {
    t5 = $[8];
    t6 = $[9];
  }
  useEffect(t5, t6);
  let t7;
  if ($[10] !== clock || $[11] !== count || $[12] !== props.total) {
    t7 = () => {
      if (!online) {
        return;
      }
      const doubled = count * 2;
      log(`${count} of ${doubled} at ${clock}`);
      props.total.update(() => count);
    };
    $[10] = clock;
    $[11] = count;
    $[12] = props.total;
    $[13] = t7;
  } else {
    t7 = $[13];
  }
  let t8;
  if ($[14] !== clock || $[15] !== count) {
    t8 = [online, count, log, clock];
    $[14] = clock;
    $[15] = count;
    $[16] = t8;
  } else {
    t8 = $[16];
  }
  useEffect(t7, t8);
  let t9;
  if ($[17] !== props.query.value) {
    t9 = {
      value: props.query.value
    };
    $[17] = props.query.value;
    $[18] = t9;
  } else {
    t9 = $[18];
  }
  useTitle(t9, " | search");
  let t10;
  if ($[19] !== results) {
    t10 = results.map(_temp5);
    $[19] = results;
    $[20] = t10;
  } else {
    t10 = $[20];
  }
  let t11;
  if ($[21] !== t10) {
    t11 = <ul>{t10}</ul>;
    $[21] = t10;
    $[22] = t11;
  } else {
    t11 = $[22];
  }
  return t11;
}
function _temp5(result) {
  return <li key={result}>{result}</li>;
}
function _temp4(prev) {
  return {
    ...prev,
    page: prev.page + 1
  };
}
function _temp3(n_0) {
  return n_0 + 1;
}
function _temp2(message) {
  return console.log(PREFIX, message);
}
function _temp(n) {
  return n + 1;
}
