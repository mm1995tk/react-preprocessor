import { useEffect, useState } from "react";
import { useReducer } from "react";
import type { Derived, Reactive } from "react-preprocessor";
declare const search: (query: string, page: number, signal: AbortSignal) => Promise<string[]>;
const PREFIX = "app";

// A custom hook that takes a reactive value and a plain value
export const useTitle = ({
  value: title
}: Derived<string>, suffix: string) => {
  useEffect(() => {
    document.title = `${PREFIX}: ${title}${suffix}`;
  }, [title, suffix]);
};
export function Search(props: {
  query: Derived<string>;
  total: Reactive<number>;
  limit: number;
}) {
  const [state, setState] = useState({
    page: 1,
    size: 20
  });
  const [results, setResults] = useState<string[]>([]);
  const count = results.length;
  const online = navigator.onLine;
  const [ticks, tick] = useReducer((n: number) => n + 1, 0);
  const clock = ticks,
    setClock = () => tick();
  const log = (message: string) => console.log(PREFIX, message);

  // Runs once on mount
  useEffect(() => {
    const id = setInterval(() => setClock(n => n + 1), 1000);
    return () => clearInterval(id);
  }, [setClock]);

  // Values read with `$`, a lens, and a prop. The setters are not dependencies
  useEffect(() => {
    const controller = new AbortController();
    search(props.query.value, state.page, controller.signal).then(found => {
      (next => setResults(() => next))(found.slice(0, props.limit));
      setState(prev => ({
        ...prev,
        page: prev.page + 1
      }));
    });
    return () => controller.abort();
  }, [props.query.value, state.page, props.limit]);

  // Derived values and plain values of the component
  useEffect(() => {
    if (!online) return;
    const doubled = count * 2;
    log(`${count} of ${doubled} at ${clock}`);
    props.total.update(() => count);
  }, [online, count, log, clock]);
  useTitle({
    value: props.query.value
  }, " | search");
  return <ul>
      {results.map(result => <li key={result}>{result}</li>)}
    </ul>;
}
