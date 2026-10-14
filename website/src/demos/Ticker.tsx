import { $, reactive } from "react-preprocessor";

export const Ticker = () => {
  const running = reactive.new(false);
  const delay = reactive.new(1000);
  const ticks = reactive.new(0);

  // useEffect, with the dependency array written by the preprocessor
  reactive.effect(() => {
    if (!$(running)) return;
    const id = setInterval(() => ticks.update((n) => n + 1), $(delay));
    return () => clearInterval(id);
  });

  return (
    <p>
      ticks: {ticks}
      <button onClick={() => running.update((on) => !on)}>
        {running.derive((on) => (on ? "stop" : "start"))}
      </button>
      every{" "}
      <select value={delay} onChange={(e) => delay.set(Number(e.target.value))}>
        <option value={250}>250 ms</option>
        <option value={1000}>1 s</option>
      </select>
    </p>
  );
};
