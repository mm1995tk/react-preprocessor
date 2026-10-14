import { useState } from "react";
declare const items: number[];
export const Inline = () => {
  const [cnt] = useState(0);
  const [user] = useState({
    name: "a",
    age: 1
  });
  const [handler] = useState(() => () => {});

  // A parameter that appears more than once can still be inlined when the argument is an identifier
  const square = cnt * cnt;
  // Chains are inlined from the inside out
  const chained = (cnt + 1) * 2;
  // Using a non-identifier more than once would repeat the computation, so the call is kept
  const repeated = (n => n * n)(cnt + 1);
  // A name declared in the body would capture the argument of the same name, so the call is kept
  const shadowed = (n => items.map(cnt => cnt + n))(cnt);
  // Shorthand property
  const boxed = {
    n: cnt,
    value: cnt
  };
  // A property name is not the parameter
  const named = user.name + user.age;
  // A function with a block body is kept as a call
  const block = (n => {
    return n + 1;
  })(cnt);
  return <ul onClick={() => handler()}>
      {square} {chained} {repeated} {shadowed} {named} {block}
      {boxed.value}
    </ul>;
};
