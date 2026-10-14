import { $, reactive } from "react-preprocessor";

declare const items: number[];

export const Inline = () => {
  const cnt = reactive.new(0);
  const user = reactive.new({ name: "a", age: 1 });
  const handler = reactive.new(() => {});

  // A parameter that appears more than once can still be inlined when the argument is an identifier
  const square = cnt.derive((n) => n * n);
  // Chains are inlined from the inside out
  const chained = cnt.derive((n) => n + 1).derive((n) => n * 2);
  // Using a non-identifier more than once would repeat the computation, so the call is kept
  const repeated = cnt.derive((n) => n + 1).derive((n) => n * n);
  // A name declared in the body would capture the argument of the same name, so the call is kept
  const shadowed = cnt.derive((n) => items.map((cnt) => cnt + n));
  // Shorthand property
  const boxed = cnt.derive((n) => ({ n, value: n }));
  // A property name is not the parameter
  const named = user.derive((n) => n.name + n.age);
  // A function with a block body is kept as a call
  const block = cnt.derive((n) => {
    return n + 1;
  });

  return (
    <ul onClick={reactive.handler(() => $(handler)())}>
      {square} {chained} {repeated} {shadowed} {named} {block}
      {boxed.derive((b) => b.value)}
    </ul>
  );
};
