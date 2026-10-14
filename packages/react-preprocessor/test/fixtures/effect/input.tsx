import { useReducer } from "react";
import { $, reactive, type Derived, type Reactive } from "react-preprocessor";

declare const search: (query: string, page: number, signal: AbortSignal) => Promise<string[]>;

const PREFIX = "app";

// A custom hook that takes a reactive value and a plain value
export const useTitle = (title: Derived<string>, suffix: string) => {
  reactive.effect(() => {
    document.title = `${PREFIX}: ${$(title)}${suffix}`;
  });
};

export function Search(props: { query: Derived<string>; total: Reactive<number>; limit: number }) {
  const state = reactive.new({ page: 1, size: 20 });
  const results = reactive.new<string[]>([]);
  const count = results.derive((list) => list.length);
  const online = reactive.of(navigator.onLine);
  const [ticks, tick] = useReducer((n: number) => n + 1, 0);
  const clock = reactive.from(ticks, () => tick());
  const log = (message: string) => console.log(PREFIX, message);

  // Runs once on mount
  reactive.effect(() => {
    const id = setInterval(() => clock.update((n) => n + 1), 1000);
    return () => clearInterval(id);
  });

  // Values read with `$`, a lens, and a prop. The setters are not dependencies
  reactive.effect(() => {
    const controller = new AbortController();
    search($(props.query), $(state.focus("page")), controller.signal).then((found) => {
      results.set(found.slice(0, props.limit));
      state.focus("page").update((page) => page + 1);
    });
    return () => controller.abort();
  });

  // Derived values and plain values of the component
  reactive.effect(() => {
    if (!$(online)) return;
    const doubled = count.derive((n) => n * 2);
    log(`${$(count)} of ${$(doubled)} at ${$(clock)}`);
    props.total.set($(count));
  });

  useTitle(props.query, " | search");

  return (
    <ul>
      {results.each(
        (result) => result,
        (result) => (
          <li>{result}</li>
        ),
      )}
    </ul>
  );
}
