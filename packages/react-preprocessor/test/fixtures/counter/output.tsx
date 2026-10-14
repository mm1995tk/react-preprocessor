import { useState } from "react";
import type { Reactive } from "react-preprocessor";
export const Counter = () => {
  const [cnt, setCnt] = useState<number>(0);
  const double = cnt * 2;
  return <>
      now: {cnt} / double: {double}
      <button onClick={() => setCnt(n => n + 1)}>inc</button>
    </>;
};
