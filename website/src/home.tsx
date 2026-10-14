import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { $, reactive } from "react-preprocessor";
import { Footer, Header, links } from "./Chrome.tsx";
import { Code } from "./Code.tsx";
import { Compare } from "./Compare.tsx";
import { Demo, type Example } from "./Demo.tsx";
import { Account } from "./demos/Account.tsx";
import account from "./demos/Account.tsx?demo";
import { Cart } from "./demos/Cart.tsx";
import cart from "./demos/Cart.tsx?demo";
import { Counter } from "./demos/Counter.tsx";
import counter from "./demos/Counter.tsx?demo";
import rejected from "./demos/Rejected.tsx?rejected";
import { Ticker } from "./demos/Ticker.tsx";
import ticker from "./demos/Ticker.tsx?demo";
import { Todos } from "./demos/Todos.tsx";
import todos from "./demos/Todos.tsx?demo";
import { cli, install, setups, tsconfig } from "./snippets.ts";
import "./style.css";

const demos: Example[] = [
  {
    label: "State",
    lead: "reactive.new is useState. derive computes a value from it. The reactive value goes straight into JSX.",
    code: counter,
    live: <Counter />,
  },
  {
    label: "Derived values",
    lead: "reactive.derive computes from several values. $(r) reads one inside the block.",
    code: cart,
    live: <Cart />,
  },
  {
    label: "Lenses and lists",
    lead: "focus is a writable view of one property. each gives one reactive value per item. Updates are written back to the state they came from.",
    code: todos,
    live: <Todos />,
  },
  {
    label: "Narrowing",
    lead: "when narrows with a type guard, match with a discriminated union. The narrowed value is still writable: an update checks the guard again when it is applied.",
    code: account,
    live: <Account />,
  },
  {
    label: "Effects",
    lead: "reactive.effect is useEffect. The dependency array is written by the preprocessor from what the block reads, so there is none to write by hand.",
    code: ticker,
    live: <Ticker />,
  },
];

const principles: { title: string; body: ReactNode }[] = [
  {
    title: "Marked by its type",
    body: (
      <>
        A reactive value is a <code>Reactive&lt;T&gt;</code> (writable) or a{" "}
        <code>Derived&lt;T&gt;</code> (read-only). You can tell state from a plain value by looking
        at the type.
      </>
    ),
  },
  {
    title: "There is no get",
    body: (
      <>
        You cannot pull the value out. You derive from it with <code>derive</code> or{" "}
        <code>reactive.derive</code>, or you use it in JSX.
      </>
    ),
  },
  {
    title: "Updates are pure functions",
    body: (
      <>
        <code>update(old =&gt; next)</code> takes a pure function from the old value to the new one.{" "}
        <code>set(next)</code> is the shortcut for a constant, read when <code>set</code> is called.
      </>
    ),
  },
  {
    title: "Lenses reach into nested state",
    body: (
      <>
        <code>focus</code> and <code>each</code> hand out a part of the state as a reactive value.
        An update of the part is written back to the whole.
      </>
    ),
  },
  {
    title: "Narrowing keeps the value writable",
    body: (
      <>
        <code>when</code> narrows with a type guard, <code>match</code> with a discriminated union.
        An update through the narrowed value checks the guard again when it is applied, and is
        dropped if it no longer holds.
      </>
    ),
  },
  {
    title: "Effects list their own dependencies",
    body: (
      <>
        <code>reactive.effect</code> becomes <code>useEffect</code>. The dependency array is written
        by the preprocessor from what the block reads, so it is never stale and never written by
        hand.
      </>
    ),
  },
  {
    title: "The source is valid TypeScript",
    body: "There is no custom file extension. Type checkers, editors, and formatters work unchanged.",
  },
  {
    title: "Nothing is left at runtime",
    body: (
      <>
        <code>Reactive&lt;T&gt;</code> exists only at compile time. The output is plain React, with
        no runtime library.
      </>
    ),
  },
];

const Install = () => {
  const copied = reactive.new(false);
  const copy = async () => {
    await navigator.clipboard.writeText(install);
    copied.set(true);
    setTimeout(() => copied.set(false), 1500);
  };
  return (
    <div className="install">
      <code>
        <span aria-hidden="true">$ </span>
        {install}
      </code>
      <button type="button" onClick={copy}>
        {copied.derive((done) => (done ? "Copied" : "Copy"))}
      </button>
    </div>
  );
};

const Demos = () => {
  const active = reactive.new(0);
  return (
    <section className="section" id="try" aria-labelledby="demos-title">
      <h2 id="demos-title">You write this. It ships as that.</h2>
      <p className="section-lead">
        Edit the code on the left. The plain React on the right and the running example follow as
        you type.
      </p>
      <div className="tabs" role="tablist" aria-label="Examples">
        {demos.map((demo, index) => (
          <button
            key={demo.label}
            type="button"
            role="tab"
            aria-selected={$(active) === index}
            onClick={() => active.set(index)}
          >
            {demo.label}
          </button>
        ))}
      </div>
      {/* Every example stays mounted, so that switching tabs keeps the edits */}
      {demos.map((demo, index) => (
        <div role="tabpanel" key={demo.label} hidden={$(active) !== index}>
          <Demo example={demo} />
        </div>
      ))}
      <p className="note">
        What you see before editing was produced when this site was built. Edits are transformed in
        your browser by the same Babel plugin, without the type checker (<code>types: false</code>
        ): a prop is reactive when its type is written in the same file.
      </p>
    </section>
  );
};

const Setup = () => {
  const active = reactive.new(0);
  return (
    <section className="section" aria-labelledby="setup-title">
      <h2 id="setup-title">Setup</h2>
      <p className="section-lead">
        Node.js 22.12 or later. TypeScript 7 or later for the type-aware lookup of reactive props.
        Put the preprocessor before the React Compiler.
      </p>
      <div className="tabs" role="tablist" aria-label="Build tools">
        {setups.map((setup, index) => (
          <button
            key={setup.label}
            type="button"
            role="tab"
            aria-selected={$(active) === index}
            onClick={() => active.set(index)}
          >
            {setup.label}
          </button>
        ))}
      </div>
      <div className="stack">
        {active.derive((index) => {
          const setup = setups[index]!;
          return (
            <figure className="pane" role="tabpanel">
              <figcaption>{setup.file}</figcaption>
              <Code code={setup.code} />
            </figure>
          );
        })}
        <figure className="pane">
          <figcaption>tsconfig.json</figcaption>
          <Code code={tsconfig} />
        </figure>
        <figure className="pane">
          <figcaption>Command line</figcaption>
          <Code code={cli} plain />
        </figure>
      </div>
      <p className="section-lead">
        <code>print</code> writes the plain React a file becomes. <code>eject</code> rewrites a
        project to plain React, for when you stop using the preprocessor. Both are in the{" "}
        <a href={links.cli}>README</a>, with Jotai, the <a href={links.api}>full API</a>, and the
        lint settings.
      </p>
    </section>
  );
};

const Home = () => (
  <>
    <Header />
    <main>
      <section className="hero">
        <p className="status">Experimental</p>
        <h1>
          React state,
          <br />
          marked by its <span className="accent">type</span>.
        </h1>
        <p className="hero-lead">
          react-preprocessor is syntactic sugar for React state. State is a{" "}
          <code>Reactive&lt;T&gt;</code>, and there is no <code>get</code>. At build time it is
          rewritten into plain React.
        </p>
        <div className="actions">
          <a className="button primary" href="#try">
            Try it on this page
          </a>
          <a className="button" href={links.github}>
            GitHub
          </a>
        </div>
        <Install />
      </section>

      <Demos />

      <Compare />

      <section className="section" aria-labelledby="why-title">
        <h2 id="why-title">Why</h2>
        <ol className="principles">
          {principles.map((principle) => (
            <li key={principle.title}>
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="rejects-title">
        <h2 id="rejects-title">Misuse is a build error</h2>
        <p className="section-lead">
          What the type checker cannot see, the preprocessor reports with a code frame: a reactive
          value used as a plain value, <code>reactive.new</code> or <code>reactive.effect</code>{" "}
          inside a condition, a loop, or a nested function, an <code>update</code> during render,
          and <a href={links.rejects}>more</a>. This is the real error for the file on the left.
        </p>
        <div className="pair">
          <figure className="pane">
            <figcaption>You write</figcaption>
            <Code code={rejected.source} />
          </figure>
          <div className="pair-arrow" aria-hidden="true">
            {"=>"}
          </div>
          <figure className="pane error">
            <figcaption>The build stops</figcaption>
            <Code code={rejected.error} plain />
          </figure>
        </div>
      </section>

      <section className="section" aria-labelledby="pipeline-title">
        <h2 id="pipeline-title">Where it sits</h2>
        <p className="section-lead">
          Performance is not a goal. Memoization is left to React and the React Compiler, which runs
          after this preprocessor.
        </p>
        <ol className="pipeline">
          <li>
            React + sugar <small>.tsx</small>
          </li>
          <li className="step">react-preprocessor</li>
          <li>
            plain React <small>.tsx</small>
          </li>
          <li className="step muted">React Compiler</li>
          <li>optimized React</li>
        </ol>
      </section>

      <Setup />
    </main>
    <Footer />
  </>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
