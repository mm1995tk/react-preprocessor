import type { ReactNode } from "react";
import { $, reactive } from "react-preprocessor";
import { Code } from "./Code.tsx";
import immer from "./demos/compare/Immer.tsx?demo";
import jotai from "./demos/compare/Jotai.tsx?demo";
import sugar from "./demos/compare/Sugar.tsx?demo";
import plain from "./demos/compare/UseState.tsx?demo";

// The files are real components. The website's type check covers them, so the code shown here compiles
const others = [
  { label: "useState", code: plain.source },
  { label: "Immer", code: immer.source },
  { label: "Jotai", code: jotai.source },
];

const columns = ["useState", "Immer (use-immer)", "Jotai", "react-preprocessor"];

const rows: { aspect: string; cells: ReactNode[] }[] = [
  {
    aspect: "Toggling one item's done",
    cells: [
      "Copies the list and the item by hand",
      "Mutates a draft, which Immer turns into a copy",
      <>
        Sets the item's own atom (<code>splitAtom</code>), copying the item by hand
      </>,
      <>
        A lens: <code>todo.focus("done")</code>, written back by key
      </>,
    ],
  },
  {
    aspect: "The dependency array",
    cells: [
      "Written by hand; a lint rule checks it",
      "Written by hand; a lint rule checks it",
      "Written by hand; a lint rule checks it",
      "Written by the preprocessor from what the effect reads",
    ],
  },
  {
    aspect: "Is state told apart from a plain value by its type?",
    cells: [
      <>
        No: <code>todos</code> is a <code>Todo[]</code>
      </>,
      <>
        No: <code>todos</code> is a <code>Todo[]</code>
      </>,
      <>
        Only the atom: <code>PrimitiveAtom&lt;Todo&gt;</code>. The value read from it is a plain{" "}
        <code>Todo</code>
      </>,
      <>
        Yes: <code>Reactive&lt;Todo[]&gt;</code>, <code>Derived&lt;number&gt;</code>
      </>,
    ],
  },
  {
    aspect: "Where the state lives",
    cells: [
      "In the component",
      "In the component",
      "In atoms declared outside the component, shared through a store",
      "In the component (it is useState)",
    ],
  },
  {
    aspect: "Added to the bundle",
    cells: ["Nothing", "immer, use-immer", "jotai", "Nothing"],
  },
];

export const Compare = () => {
  const active = reactive.new(0);
  return (
    <section className="section" id="compare" aria-labelledby="compare-title">
      <h2 id="compare-title">Compared with</h2>
      <p className="section-lead">
        One list, four ways. Clicking an item toggles it, and the page title shows how many are
        left. The Jotai version keeps the list in atoms outside the component, as Jotai does. Each
        version is a real file that this site type-checks.
      </p>
      <div className="tabs" role="tablist" aria-label="Compared with">
        {others.map((other, index) => (
          <button
            key={other.label}
            type="button"
            role="tab"
            aria-selected={$(active) === index}
            onClick={() => active.set(index)}
          >
            {other.label}
          </button>
        ))}
      </div>
      {active.derive((index) => {
        const other = others[index]!;
        return (
          <div className="pair" role="tabpanel">
            <figure className="pane">
              <figcaption>{other.label}</figcaption>
              <Code code={other.code} />
            </figure>
            <div className="pair-arrow pair-vs" aria-hidden="true">
              vs
            </div>
            <figure className="pane">
              <figcaption>react-preprocessor</figcaption>
              <Code code={sugar.source} />
            </figure>
          </div>
        );
      })}
      <div className="compare-table">
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Aspect</span>
              </th>
              {columns.map((column) => (
                <th key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.aspect}>
                <th scope="row">{row.aspect}</th>
                {row.cells.map((cell, index) => (
                  <td key={columns[index]}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Immer and Jotai are libraries you can add to any part of an app. react-preprocessor is a
        build step: its output is plain useState code like the first version, with the update and
        the dependency array written for you.
      </p>
    </section>
  );
};
