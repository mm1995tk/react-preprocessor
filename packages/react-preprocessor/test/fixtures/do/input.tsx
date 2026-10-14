import { $, reactive } from "react-preprocessor";

export const Total = () => {
  const price = reactive.new(100);
  const qty = reactive.new(1);
  const total = reactive.derive(() => $(price) * $(qty));
  const summary = reactive.derive(() => {
    const value = $(total);
    if (value > 1000) return "expensive";
    return "cheap";
  });
  const twice = reactive.derive(() => {
    return $(total.derive((n) => n * 2));
  });
  return (
    <p>
      {total} {summary} {twice}
      {reactive.derive(() => ($(qty) > 0 ? <b>in cart</b> : null))}
    </p>
  );
};
