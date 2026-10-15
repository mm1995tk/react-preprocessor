import { act, cleanup, render } from "@testing-library/react";
import { useReducer } from "react";
import { reactive } from "react-preprocessor";
import { afterEach, expect, test } from "vitest";
afterEach(cleanup);
let renders = 0;
const FromEffect = () => {
  renders++;
  const [s, dispatch] = useReducer((s: number, f: (n: number) => number) => f(s), 0);
  const n = reactive.from(s, (f) => dispatch(f));
  reactive.effect(() => {
    n.update((x) => (x < 30 ? x + 1 : x));
  });
  return <p>{n}</p>;
};
test("an effect that updates through an inline updater of reactive.from runs once", async () => {
  await act(async () => void render(<FromEffect />));
  expect(renders).toBe(2);
});
