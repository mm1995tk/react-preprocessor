import { atom } from "jotai";
import { $ } from "react-preprocessor";
import { useReactiveAtom, useReactiveAtomValue } from "react-preprocessor/jotai";

const countAtom = atom(0);
const doubleAtom = atom((get) => get(countAtom) * 2);

// An atom that only accepts a new value. It does not accept an updater
const draftAtom = atom({ name: "a", visits: 0 });
const visitsAtom = atom(
  (get) => get(draftAtom).visits,
  (_get, set, next: number) => set(draftAtom, (prev) => ({ ...prev, visits: next })),
);

export const AtomCounter = () => {
  const count = useReactiveAtom(countAtom);
  const double = useReactiveAtomValue(doubleAtom);
  const visits = useReactiveAtom(visitsAtom);
  return (
    <>
      <output>
        {count} {double} {visits}
      </output>
      <button onClick={() => count.update((n) => n + 1)} disabled={$(count) >= 3}>
        inc
      </button>
      <button
        onClick={() => {
          // Twice in one event. The later call receives the result of the earlier one
          visits.update((n) => n + 1);
          visits.update((n) => n + 1);
        }}
      >
        visit
      </button>
      <button onClick={() => count.set(0)}>reset</button>
    </>
  );
};
