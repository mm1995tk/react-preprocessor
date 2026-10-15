// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { transformSync } from "@babel/core";
import { describe, expect, test } from "vitest";
import plugin from "../src/babel.ts";

const fixtures = join(import.meta.dirname, "fixtures");

// String-only tests have no file on disk. They are checked with the transform that uses no types
const transform = (code: string, filename = "input.tsx", types = false): string => {
  const result = transformSync(code, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [[plugin, { types }]],
  });
  return `${result?.code ?? ""}\n`;
};

describe("fixtures", () => {
  for (const name of readdirSync(fixtures)) {
    test(name, async () => {
      const file = join(fixtures, name, "input.tsx");
      const input = readFileSync(file, "utf8");
      const output = join(fixtures, name, "output.tsx");
      await expect(transform(input, file, true)).toMatchFileSnapshot(output);
    });
  }
});

describe("pass-through", () => {
  test("a file that does not import the sugar is left untouched", () => {
    const code = `const xs = [1, 2].map(n => n * 2);\n`;
    expect(transform(code)).toBe(`const xs = [1, 2].map(n => n * 2);\n`);
  });

  test("`map` on a plain array is left untouched", () => {
    const code = `
      import { reactive } from "react-preprocessor";
      export const C = () => {
        const cnt = reactive.new(0);
        const xs = [1, 2].map((n) => n * 2);
        return <>{cnt}{xs}</>;
      };
    `;
    expect(transform(code)).toContain("[1, 2].map(n => n * 2)");
  });

  test("a reactive value in an attribute of a DOM element becomes a plain value", () => {
    const code = `
      import { reactive } from "react-preprocessor";
      export const C = () => {
        const text = reactive.new("");
        return <input value={text} onChange={(e) => text.set(e.target.value)} />;
      };
    `;
    expect(transform(code)).toContain(
      "<input value={text} onChange={e => (next => setText(() => next))(e.target.value)} />",
    );
  });

  test("set evaluates its argument at the call, unless it is a constant", () => {
    const code = `
      import { reactive } from "react-preprocessor";
      const initial = { name: "" };
      export const C = ({ draft }: { draft: string }) => {
        const state = reactive.new(initial);
        const name = state.focus("name");
        const a = () => name.set(draft.trim());
        const b = () => name.set("x");
        const c = () => state.set(initial);
        const d = () => state.set({ name: "y" });
        const e = () => state.set({ name: draft });
        return null;
      };
    `;
    const output = transform(code);
    expect(output).toContain(
      "const a = () => (next => setState(prev => ({\n    ...prev,\n    name: next\n  })))(draft.trim());",
    );
    expect(output).toContain('name: "x"');
    expect(output).toContain("const c = () => setState(() => initial);");
    expect(output).toContain('const d = () => setState(() => ({\n    name: "y"\n  }));');
    expect(output).toContain(
      "const e = () => (next => setState(() => next))({\n    name: draft\n  });",
    );
  });

  test("a reactive value in a dependency array of a React hook becomes a plain value", () => {
    const code = `
      import { useEffect, useMemo } from "react";
      import * as React from "react";
      import { $, reactive, type Derived } from "react-preprocessor";
      export const C = ({ label }: { label: Derived<string> }) => {
        const state = reactive.new({ cnt: 0 });
        const double = state.focus("cnt").derive((n) => n * 2);
        useEffect(reactive.handler(() => void (document.title = $(label) + $(double))), [label, double]);
        React.useLayoutEffect(() => {}, [state.focus("cnt")]);
        const f = useMemo(() => () => {}, [state]);
        return null;
      };
    `;
    const output = transform(code);
    expect(output).toContain("label + double), [label, double]);");
    expect(output).toContain("React.useLayoutEffect(() => {}, [state.cnt]);");
    expect(output).toContain("useMemo(() => () => {}, [state]);");
  });

  test("a handler reads current values with $", () => {
    const code = `
      import { $, reactive } from "react-preprocessor";
      export const C = () => {
        const a = reactive.new(1);
        const b = a.derive((n) => n * 2);
        return <button onClick={reactive.handler((e) => console.log(e.type, $(a) + $(b)))}>{a}</button>;
      };
    `;
    expect(transform(code)).toContain(
      "<button onClick={e => console.log(e.type, a + b)}>{a}</button>",
    );
  });

  test("$ reads a value inside JSX braces", () => {
    const code = `
      import { $, reactive } from "react-preprocessor";
      export const C = () => {
        const dirty = reactive.new(false);
        const saving = reactive.new(false);
        const error = reactive.new<string | null>(null);
        return (
          <form onSubmit={(e) => console.log(e.type, $(dirty))}>
            <button disabled={!$(dirty) || $(saving)}>save</button>
            {$(error) && <p>{error}</p>}
          </form>
        );
      };
    `;
    const output = transform(code);
    expect(output).toContain("<form onSubmit={e => console.log(e.type, dirty)}>");
    expect(output).toContain("<button disabled={!dirty || saving}>save</button>");
    expect(output).toContain("{error && <p>{error}</p>}");
  });

  test("an aliased import is recognised", () => {
    const code = `
      import { reactive as r } from "react-preprocessor";
      export const C = () => {
        const cnt = r.new(0);
        return <>{cnt}</>;
      };
    `;
    expect(transform(code)).toContain("const [cnt] = useState(0);");
  });

  test("generated names avoid names already in use", () => {
    const code = `
      import { reactive } from "react-preprocessor";
      const useState = 1, setCnt = 2;
      export const C = () => {
        const cnt = reactive.new(0);
        return <button onClick={() => cnt.update((n) => n + 1)}>{cnt}{useState}{setCnt}</button>;
      };
    `;
    const output = transform(code);
    expect(output).toContain(`import { useState as useState2 } from "react";`);
    expect(output).toContain("const [cnt, setCnt2] = useState2(0);");
  });

  test("focus on `__proto__` writes a computed key, which defines a property", () => {
    const code = `
      import { reactive } from "react-preprocessor";
      export const C = () => {
        const bag = reactive.new({ ["__proto__"]: 1 });
        return <button onClick={() => bag.focus("__proto__").update((n) => n + 1)}>{bag.focus("__proto__")}</button>;
      };
    `;
    expect(transform(code)).toContain(`["__proto__"]: prev.__proto__ + 1`);
  });

  test("when re-checks the guard when the update is applied", () => {
    const code = `
      import { reactive } from "react-preprocessor";
      const isSet = (n) => n !== null;
      export const C = () => {
        const cnt = reactive.new(null);
        return <>{cnt.when(isSet, { narrowed: (n) => <button onClick={() => n.update((old) => old + 1)}>{n}</button> })}</>;
      };
    `;
    const output = transform(code);
    expect(output).toContain("setCnt(prev => isSet(prev) ? prev + 1 : prev)");
    expect(output).toContain("{isSet(cnt) ? <button");
    expect(output).toContain("{cnt}</button> : undefined}");
  });

  test("when computes a receiver that is not a plain reference once", () => {
    const code = `
      import { reactive } from "react-preprocessor";
      export const C = () => {
        const list = reactive.new([1]);
        return <>{list.derive((xs) => xs.find((x) => x > 0)).when((x) => x !== undefined, { narrowed: (x) => <b>{x}{x}</b>, rest: () => "none" })}</>;
      };
    `;
    expect(transform(code)).toContain(
      `{(value => value !== undefined ? <b>{value}{value}</b> : "none")(list.find(x => x > 0))}`,
    );
  });

  test("match compares every case, also with keys that are not identifiers", () => {
    const code = `
      import { reactive } from "react-preprocessor";
      export const C = () => {
        const state = reactive.new({ "the-kind": "a-b", n: 0 });
        return <>{state.match("the-kind", {
          "a-b": (s) => <button onClick={() => s.focus("n").update((n) => n + 1)}>{s.focus("n")}</button>,
          1: function () { return null; },
        })}</>;
      };
    `;
    const output = transform(code);
    expect(output).toContain(`{state["the-kind"] === "a-b" ? <button`);
    expect(output).toContain(`setState(prev => prev["the-kind"] === "a-b" ? {`);
    expect(output).toContain(`: state["the-kind"] === 1 ? function () {`);
    expect(output).toContain("}() : undefined}");
  });
});

const effect = (block: string, declarations = ""): string => `
  import { $, reactive, type Derived, type Reactive } from "react-preprocessor";
  const LIMIT = 10;
  export const C = (props: { id: string; label: Derived<string>; total: Reactive<number> }) => {
    const cnt = reactive.new(0);
    const state = reactive.new({ page: 1, size: 20 });
    const double = cnt.derive((n) => n * 2);
    ${declarations}
    reactive.effect(${block});
    return <>{cnt}{double}</>;
  };
`;

/** The dependency array of the generated `useEffect` */
const dependencies = (output: string): string => /useEffect\([^]*, (\[.*\])\);/.exec(output)![1]!;

describe("reactive.effect", () => {
  test("values read with $ become dependencies", () => {
    const output = transform(effect("() => { console.log($(cnt), $(double)); }"));
    expect(output).toContain(`import { useState, useEffect } from "react";`);
    expect(output).toContain("console.log(cnt, double);");
    expect(dependencies(output)).toBe("[cnt, double]");
  });

  test("what the updater of reactive.from reads is a dependency, the generated setters are not", () => {
    const code = `
      import { useReducer } from "react";
      import { reactive } from "react-preprocessor";
      export const C = ({ step }: { step: number }) => {
        const [state, dispatch] = useReducer((n: number, f: (n: number) => number) => f(n), 0);
        const n = reactive.from(state, (f) => dispatch((old) => f(old) + step));
        const cnt = reactive.new(0);
        reactive.effect(() => {
          n.update((old) => old + 1);
          cnt.set(1);
        });
        return null;
      };
    `;
    // The updater is a new function on every render. Depending on it would run the effect on every render
    expect(dependencies(transform(code))).toBe("[dispatch, step]");
  });

  test("an updater of reactive.from received as a value is the dependency itself", () => {
    const code = `
      import { useState } from "react";
      import { reactive } from "react-preprocessor";
      export const C = (props: { onChange: (f: (n: number) => number) => void }) => {
        const [state, setState] = useState(0);
        const n = reactive.from(state, setState);
        const m = reactive.from(state, props.onChange);
        reactive.effect(() => {
          n.update((old) => old + 1);
          m.update((old) => old + 1);
        });
        return null;
      };
    `;
    expect(dependencies(transform(code))).toBe("[setState, props.onChange]");
  });

  test("a lens depends on the focused part", () => {
    const output = transform(effect(`() => void console.log($(state.focus("page")))`));
    expect(output).toContain("useEffect(() => void console.log(state.page), [state.page]);");
  });

  test("a derivation written in place depends on its sources", () => {
    const output = transform(effect("() => void console.log($(cnt.derive((n) => ({ n }))))"));
    expect(dependencies(output)).toBe("[cnt]");
  });

  test("reactive props depend on the received value", () => {
    const output = transform(effect("() => { console.log($(props.label), $(props.total)); }"));
    expect(dependencies(output)).toBe("[props.label.value, props.total.value]");
  });

  test("plain values of the component become dependencies", () => {
    const output = transform(
      effect(
        "() => { send(props.id, prefix, user.name, format(1)); }",
        `const prefix = "a"; const user = { name: "b" }; function format(n: number) { return n; }`,
      ),
    );
    expect(dependencies(output)).toBe("[props.id, prefix, user, format]");
  });

  test("parameters of a custom hook become dependencies", () => {
    const code = `
      import { $, reactive, type Derived } from "react-preprocessor";
      export function useLog(value: Derived<number>, { tag }: { tag: string }, level: number) {
        reactive.effect(() => console.log(tag, level, $(value)));
      }
    `;
    expect(dependencies(transform(code))).toBe("[tag, level, value]");
  });

  test("setters are not dependencies", () => {
    const output = transform(
      effect(`() => {
        cnt.set(1);
        cnt.update((n) => n + 1);
        state.focus("page").set(2);
        props.total.set(3);
        setTimeout(cnt.set, 0, 4);
      }`),
    );
    expect(output).toContain("setCnt(() => 1);");
    expect(output).toContain("props.total.update(() => 3);");
    expect(dependencies(output)).toBe("[]");
  });

  test("module-level variables and globals are not dependencies", () => {
    const output = transform(effect("() => { console.log(LIMIT, window.name, Math.max(1, 2)); }"));
    expect(dependencies(output)).toBe("[]");
  });

  test("variables of the block are not dependencies", () => {
    const output = transform(
      effect(`() => {
        const local = 1;
        const twice = cnt.derive((n: number) => n * 2);
        [1].forEach((item) => console.log(item + local + $(twice)));
      }`),
    );
    expect(output).toContain("const twice = cnt * 2;");
    expect(dependencies(output)).toBe("[cnt]");
  });

  test("dependencies are listed once", () => {
    const output = transform(
      effect(
        `() => { console.log($(cnt), $(cnt), props.id, props.id, $(state.focus("page")), $(state.focus("page"))); }`,
      ),
    );
    expect(dependencies(output)).toBe("[cnt, props.id, state.page]");
  });

  test("without dependencies it runs once on mount", () => {
    const output = transform(effect(`() => { console.log("mounted"); }`));
    expect(output).toContain(`useEffect(() => {\n    console.log("mounted");\n  }, []);`);
  });

  test("the cleanup function is passed through", () => {
    const output = transform(
      effect(`function () {
        const id = setInterval(() => cnt.update((n) => n + 1), $(double));
        return () => clearInterval(id);
      }`),
    );
    expect(output).toContain("return () => clearInterval(id);");
    expect(dependencies(output)).toBe("[double]");
  });

  test("an existing import of useEffect is reused", () => {
    const code = `
      import { useEffect as useFx } from "react";
      ${effect("() => void $(cnt)")}
    `;
    const output = transform(code);
    expect(output).toContain("useFx(() => void cnt, [cnt]);");
    expect(output).toContain(`import { useState } from "react";`);
  });
});

const clock = (before: string, after: string): string => `
  import { useReducer } from "react";
  import { reactive } from "react-preprocessor";
  export const C = () => {
    const [state, dispatch] = useReducer((n: number, f: (n: number) => number) => f(n), 0);
    ${before}
    reactive.effect(() => {
      const id = setInterval(() => clock.update((n) => n + 1), 1000);
      return () => clearInterval(id);
    });
    ${after}
    return null;
  };
`;
const declaration = "const clock = reactive.from(state, (f) => dispatch(f));";

/** The message of the build error */
const errorOf = (code: string): string => {
  try {
    transform(code);
  } catch (error) {
    return (error as Error).message;
  }
  return "";
};

describe("reactive.effect and the order of declarations", () => {
  // The dependency array is evaluated during render, where the effect is written
  test("a plain value declared after the effect is rejected", () => {
    const code = effect("() => { console.log(helper, $(cnt)); }").replace(
      "return <>",
      "const helper = Math.random();\n    return <>",
    );
    expect(() => transform(code)).toThrow(
      /`helper` is declared after this `reactive.effect`, which depends on it/,
    );
  });

  test("a reactive value declared after the effect is rejected", () => {
    const code = effect("() => { console.log($(later)); }").replace(
      "return <>",
      "const later = cnt.derive((n) => n + 1);\n    return <>",
    );
    expect(() => transform(code)).toThrow(/`later` is declared after this `reactive.effect`/);
  });

  test("a function declaration below the effect is hoisted, so it is fine", () => {
    const code = effect("() => { log($(cnt)); }").replace(
      "return <>",
      "function log(n: number) { console.log(n); }\n    return <>",
    );
    expect(dependencies(transform(code))).toBe("[log, cnt]");
  });

  test("what the updater of reactive.from reads is a dependency", () => {
    expect(dependencies(transform(clock(declaration, "")))).toBe("[dispatch]");
  });

  test("reactive.from declared after the effect is rejected, not silently left out", () => {
    const message = errorOf(clock("", declaration));
    expect(message).toMatch(/`clock` is declared after this `reactive.effect`/);
    // The setter is a generated node. The error points at the effect
    expect(message).toMatch(/>\s+7 \|\s+reactive\.effect\(\(\) => \{/);
    expect(message).not.toContain("internal");
  });

  test("a lens of a value declared after the effect is rejected at the lens", () => {
    const code = effect(`() => { console.log($(later.focus("a"))); }`).replace(
      "return <>",
      "const later = reactive.new({ a: 1 });\n    return <>",
    );
    const message = errorOf(code);
    expect(message).toMatch(/`later` is declared after this `reactive.effect`/);
    expect(message).toMatch(/>\s+9 \|/);
    expect(message).toContain("^^^^^^^^^^^^^^^^");
    expect(message).not.toContain("internal");
  });
});

const component = (body: string, imports = "reactive, $"): string => `
  import { ${imports} } from "react-preprocessor";
  export const C = () => {
  const cnt = reactive.new(0);
  const double = cnt.derive((n) => n * 2);
  ${body}
  return <>{cnt}{double}</>;
  };
`;

describe("errors", () => {
  const cases: [name: string, code: string, message: RegExp][] = [
    [
      "New in a condition",
      component("if (true) { const x = reactive.new(1); }"),
      /top level of a component/,
    ],
    [
      "New in a loop",
      component("for (;;) { const x = reactive.new(1); }"),
      /top level of a component/,
    ],
    [
      "New in a nested function",
      component("const f = () => { const x = reactive.new(1); };"),
      /top level of a component/,
    ],
    [
      "New at module level",
      `import { reactive } from "react-preprocessor"; const x = reactive.new(1);`,
      /top level of a component/,
    ],
    [
      "New in a plain function",
      `import { reactive } from "react-preprocessor"; function helper() { const x = reactive.new(1); }`,
      /component or a custom hook/,
    ],
    ["New that is not bound", component("reactive.new(1);"), /must be bound directly/],
    ["New bound with let", component("let x = reactive.new(1);"), /must be bound directly/],
    [
      "New destructured",
      component("const { a } = reactive.new({ a: 1 });"),
      /must be bound directly/,
    ],
    ["template literal", component("const s = `${cnt}`;"), /cannot be used as a plain value/],
    ["arithmetic", component("const s = cnt + 1;"), /cannot be used as a plain value/],
    ["condition", component("if (cnt) {}"), /cannot be used as a plain value/],
    ["plain function argument", component("console.log(cnt);"), /cannot be used as a plain value/],
    [
      "use inside a derive callback",
      component("const s = double.derive((d) => d + cnt);"),
      /cannot be used as a plain value/,
    ],
    [
      "nested derivation",
      component("const s = cnt.derive((n) => double.derive((d) => d + n));"),
      /cannot be used as a plain value/,
    ],
    [
      "returned from a handler",
      component("const f = () => cnt;"),
      /cannot be used as a plain value/,
    ],
    ["set on a derived value", component("const f = () => double.set(1);"), /read-only/],
    [
      "set during render",
      component("cnt.set(1);"),
      /`set` can only be used inside an event handler/,
    ],
    [
      "update passed around from a derived value",
      component("const f = double.update;"),
      /read-only/,
    ],
    ["unknown member", component("const s = cnt.value;"), /has no `value` member/],
    ["unknown method", component("const s = cnt.get();"), /has no `get` member/],
    [
      "update on a derived value",
      component("const f = () => double.update((n) => n);"),
      /read-only/,
    ],
    [
      "update during render",
      component("cnt.update((n) => n + 1);"),
      /`update` can only be used inside an event handler/,
    ],
    [
      "update inside the block of reactive.derive",
      component("const d = reactive.derive(() => { cnt.update((n) => n + 1); return $(cnt); });"),
      /`update` can only be used inside an event handler/,
    ],
    [
      "set inside the function of derive",
      component("const d = cnt.derive((n) => { cnt.set(n); return n; });"),
      /`set` can only be used inside an event handler/,
    ],
    [
      "update inside the render of each",
      component(
        "const xs = reactive.new([1]); const l = xs.each((n) => n, (x) => { x.update((n) => n); return <li />; });",
      ),
      /`update` can only be used inside an event handler/,
    ],
    [
      "update inside a branch of when during render",
      component(
        "const s = cnt.when((n): n is 1 => n === 1, { narrowed: (one) => { one.set(1); return 1; } });",
      ),
      /`set` can only be used inside an event handler/,
    ],
    ["with is gone", component("const f = () => cnt.with((n) => n);"), /has no `with` member/],
    [
      "map is gone",
      component("const s = cnt.map((n) => n * 2);"),
      /has no `map` member\. Use `derive`/,
    ],
    ["handler with a plain value", component("const f = reactive.handler(1);"), /takes a function/],
    ["handler passed around", component("const h = reactive.handler;"), /can only be used as/],
    ["focus on a derived value", component("const s = double.focus('x');"), /cannot be focused/],
    [
      "focus with a computed key",
      component("const k = 'a'; const s = cnt.focus(k);"),
      /string literal key/,
    ],
    [
      "each with a block body",
      component("const s = cnt.each((x) => x, (x) => { return x; });"),
      /must be an arrow function/,
    ],
    [
      "each with a named render",
      component("const r = (x) => x; const s = cnt.each((x) => x, r);"),
      /must be an arrow function/,
    ],
    [
      "update on an item of a derived list",
      component(
        "const s = double.each((x) => x, (x) => <b onClick={() => x.update((v) => v)} />);",
      ),
      /read-only/,
    ],
    [
      "optional reactive prop",
      `import type { Reactive } from "react-preprocessor"; const C = (props: { v?: Reactive<number> }) => null;`,
      /cannot be optional/,
    ],
    [
      "reactive prop with a default value",
      `import type { Reactive } from "react-preprocessor"; const C = ({ v = 1 }: { v: Reactive<number> }) => null;`,
      /must be bound to a plain name/,
    ],
    ["$ outside do", component("const v = () => $(cnt);"), /can only be used inside JSX/],
    [
      "$ on a plain value",
      component("const v = reactive.derive(() => $(1));"),
      /`\$` expects a reactive value/,
    ],
    [
      "do with a parameter",
      component("const v = reactive.derive((x) => x);"),
      /synchronous function with no parameters/,
    ],
    [
      "effect in a condition",
      component("if (true) { reactive.effect(() => {}); }"),
      /`reactive.effect` can only be called at the top level of a component/,
    ],
    [
      "effect in a loop",
      component("for (;;) reactive.effect(() => {});"),
      /`reactive.effect` can only be called at the top level of a component/,
    ],
    [
      "effect in a nested function",
      component("const f = () => { reactive.effect(() => {}); };"),
      /`reactive.effect` can only be called at the top level of a component/,
    ],
    [
      "effect inside an effect",
      component("reactive.effect(() => { reactive.effect(() => {}); });"),
      /`reactive.effect` can only be called at the top level of a component/,
    ],
    [
      "effect at module level",
      `import { reactive } from "react-preprocessor"; reactive.effect(() => {});`,
      /`reactive.effect` can only be called at the top level of a component/,
    ],
    [
      "effect in a plain function",
      `import { reactive } from "react-preprocessor"; function helper() { reactive.effect(() => {}); }`,
      /`reactive.effect` can only be called in a component or a custom hook/,
    ],
    [
      "async effect",
      component("reactive.effect(async () => { await fetch('/'); });"),
      /cannot be `async`/,
    ],
    [
      "effect with a named function",
      component("const run = () => {}; reactive.effect(run);"),
      /`reactive.effect` takes an inline function/,
    ],
    [
      "effect with a parameter",
      component("reactive.effect((x) => {});"),
      /`reactive.effect` takes an inline function/,
    ],
    [
      "effect without an argument",
      component("reactive.effect();"),
      /`reactive.effect` takes exactly 1 argument/,
    ],
    [
      "result of effect bound to a variable",
      component("const stop = reactive.effect(() => {});"),
      /Its result cannot be used as a value/,
    ],
    [
      "result of effect returned",
      `import { reactive } from "react-preprocessor"; const C = () => reactive.effect(() => {});`,
      /Its result cannot be used as a value/,
    ],
    [
      "reactive value in an effect without $",
      component("reactive.effect(() => { console.log(cnt); });"),
      /cannot be used as a plain value/,
    ],
    ["reactive passed around", component("const r = reactive;"), /can only be used as/],
    ["$ passed around", component("const d = $;"), /can only be called directly/],
    ["namespace import", `import * as rp from "react-preprocessor";`, /Only named imports/],
    [
      "when with one argument",
      component("const v = cnt.when((n) => n > 0);"),
      /takes a guard and an object literal of branches/,
    ],
    [
      "when with the branches as arguments",
      component("const v = cnt.when((n) => n > 0, (n) => 1, () => 2);"),
      /takes a guard and an object literal of branches: `when\(guard, \{ narrowed:/,
    ],
    [
      "when with the branches passed by name",
      component("const b = { narrowed: () => 1 }; const v = cnt.when((n) => n > 0, b);"),
      /takes a guard and an object literal of branches/,
    ],
    [
      "when with a branch passed by name",
      component("const show = () => 1; const v = cnt.when((n) => n > 0, { narrowed: show });"),
      /The branches of `when` are `narrowed` and an optional `rest`/,
    ],
    [
      "when with a destructured parameter",
      component("const v = cnt.when((n) => n > 0, { narrowed: ({ map }) => 1 });"),
      /The branches of `when` are `narrowed` and an optional `rest`/,
    ],
    [
      "when with an unknown branch",
      component("const v = cnt.when((n) => n > 0, { narrowed: () => 1, otherwise: () => 2 });"),
      /The branches of `when` are `narrowed` and an optional `rest`/,
    ],
    [
      "when with a branch twice",
      component("const v = cnt.when((n) => n > 0, { narrowed: () => 1, narrowed: () => 2 });"),
      /The branches of `when` are `narrowed` and an optional `rest`/,
    ],
    [
      "when without narrowed",
      component("const v = cnt.when((n) => n > 0, { rest: () => 2 });"),
      /`when` needs a `narrowed` branch/,
    ],
    [
      "update on the rest of when",
      component(
        "const v = cnt.when((n) => n > 0, { narrowed: () => 1, rest: (rest) => <i onClick={() => rest.update((n) => n)} /> });",
      ),
      /read-only and cannot be updated/,
    ],
    [
      "update on a value narrowed from a derived value",
      component(
        "const v = double.when((n) => n > 0, { narrowed: (n) => <i onClick={() => n.set(1)} /> });",
      ),
      /read-only and cannot be set/,
    ],
    [
      "narrowed value used as a plain value",
      component("const v = cnt.when((n) => n > 0, { narrowed: (n) => n + 1 });"),
      /cannot be used as a plain value/,
    ],
    ["match with one argument", component(`const v = cnt.match("kind");`), /exactly 2 arguments/],
    [
      "reactive.from with a literal",
      component("const n = reactive.from(0, () => {});"),
      /The value given to `reactive.from` is a constant, so it never changes/,
    ],
    [
      "reactive.from with a negative number",
      component("const n = reactive.from(-1, () => {});"),
      /is a constant, so it never changes/,
    ],
    [
      "reactive.from with a const that holds a literal",
      component(`const start = "a";\n  const n = reactive.from(start, () => {});`),
      /is a constant, so it never changes/,
    ],
    [
      "reactive.from with a literal marked as const",
      component("const n = reactive.from(0 as const, () => {});"),
      /is a constant, so it never changes/,
    ],
    [
      "reactive.from with a literal checked by satisfies",
      component("const start = 0 satisfies number;\n  const n = reactive.from(start, () => {});"),
      /is a constant, so it never changes/,
    ],
    [
      "reactive.from with a const that leads to a literal through another const",
      component("const a = 0;\n  const b = a;\n  const n = reactive.from(b, () => {});"),
      /is a constant, so it never changes/,
    ],
    [
      "reactive.from with a const that holds undefined",
      component("const b = undefined;\n  const n = reactive.from(b, () => {});"),
      /is a constant, so it never changes/,
    ],
    [
      "reactive.from with the negation of a const literal",
      component("const start = 1;\n  const n = reactive.from(-start, () => {});"),
      /is a constant, so it never changes/,
    ],
    [
      "reactive.from with an annotated const that holds a literal",
      component("const start: number = 0;\n  const n = reactive.from(start, () => {});"),
      /is a constant, so it never changes/,
    ],
    [
      "when as a statement during render",
      component("cnt.when((n) => n !== 0, { narrowed: (n) => n.derive(String) });"),
      /As a statement, `when` can only be used inside an event handler, not during render/,
    ],
    [
      "match as a statement during render",
      component(`cnt.match("kind", { a: () => 1 });`),
      /As a statement, `match` can only be used inside an event handler/,
    ],
    [
      "when returned from a handler",
      component("const f = () => cnt.when((n) => n !== 0, { narrowed: (n) => n.set(1) });"),
      /write it as a statement: `\(\) => \{ r\.when\(\.\.\.\); \}`/,
    ],
    [
      "match with a boolean case",
      component(`const v = cnt.match("ok", { true: () => 1, false: () => 2 });`),
      /would be the string "true"\. For a boolean, use `when`/,
    ],
    [
      "match with a key that is not a literal",
      component(`const key = "kind"; const v = cnt.match(key, {});`),
      /`match` takes a string literal key/,
    ],
    [
      "match with cases passed by name",
      component(`const cases = {}; const v = cnt.match("kind", cases);`),
      /must be an object literal/,
    ],
    [
      "match with a computed case",
      component(`const ok = "ok"; const v = cnt.match("kind", { [ok]: () => 1 });`),
      /Each case of `match`/,
    ],
    [
      "match with a spread case",
      component(`const rest = {}; const v = cnt.match("kind", { ...rest });`),
      /Each case of `match`/,
    ],
    [
      "match with a case that is not a function",
      component(`const v = cnt.match("kind", { ok: 1 });`),
      /Each case of `match`/,
    ],
    [
      "update on a case of a derived value",
      component(`const v = double.match("kind", { ok: (s) => <i onClick={() => s.set(1)} /> });`),
      /read-only and cannot be set/,
    ],
  ];

  for (const [name, code, message] of cases) {
    test(name, () => {
      expect(() => transform(code)).toThrow(message);
    });
  }
});

/** A component with a nullable value and a discriminated union, for `when` / `match` */
const narrowing = (body: string): string => `
  import { reactive } from "react-preprocessor";
  type Remote = { kind: "idle" } | { kind: "ok"; page: number };
  export const C = () => {
    const user = reactive.new<{ name: string } | null>(null);
    const remote = reactive.new<Remote>({ kind: "idle" });
    ${body}
    return null;
  };
`;

describe("the value of reactive.from", () => {
  test("a constant is accepted when its type is written", () => {
    const byArgument = transform(component("const n = reactive.from<number>(0, () => {});"));
    expect(byArgument).toMatch(/const n = 0[,;]/);
    const byBinding = transform(
      component(
        "const n: Reactive<number> = reactive.from(0, () => {});",
        "reactive, $, type Reactive",
      ),
    );
    expect(byBinding).toMatch(/const n = 0[,;]/);
  });

  test("a value that is not a literal is accepted", () => {
    for (const value of ["props.start", "{ a: 0 }", "[0]", "Math.random()", "`${cnt}`.length"]) {
      const code = `
        import { reactive } from "react-preprocessor";
        export const C = (props: { start: number }) => {
          const cnt = props.start;
          const n = reactive.from(${value}, () => {});
          return null;
        };
      `;
      expect(() => transform(code)).not.toThrow();
    }
  });

  test("consts that refer to each other are not followed forever", () => {
    const code = `
      import { reactive } from "react-preprocessor";
      const a: number = b;
      const b: number = a;
      export const C = () => {
        const n = reactive.from(a, () => {});
        return null;
      };
    `;
    expect(() => transform(code)).not.toThrow();
  });

  test("the message says where to write the type, in TypeScript only", () => {
    const code = component(`const n = reactive.from("a", () => {});`);
    expect(() => transform(code)).toThrow(
      /write the type at the call, `reactive\.from<T>\(\.\.\.\)`, or on the variable, `const x: Reactive<T> = reactive\.from\(\.\.\.\)`/,
    );
    let message = "";
    try {
      transform(code, "input.jsx");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/is a constant, so it never changes/);
    expect(message).not.toContain("write the type");
  });

  test("the error points at the value", () => {
    const code = component("const n = reactive.from(0, () => {});");
    expect(() => transform(code)).toThrow(/reactive\.from\(0, \(\) => \{\}\);\n\s+\|\s+\^\n/);
  });
});

describe("narrowing", () => {
  test('a quoted "true" case of match is the string', () => {
    const output = transform(
      component(`const v = cnt.match("ok", { "true": () => 1, "false": () => 2 });`),
    );
    expect(output).toContain(`cnt.ok === "true" ? 1 : cnt.ok === "false" ? 2 : undefined`);
  });

  test("when as a statement in a handler becomes an if statement", () => {
    const output = transform(
      narrowing(`const f = () => {
        user.when((u) => u !== null, { narrowed: (u) => u.focus("name").set("x"), rest: () => user.set({ name: "" }) });
      };`),
    );
    expect(output).toContain("if (user !== null) {\n      setUser(prev => prev !== null ? {");
    expect(output).toContain("} else {\n      setUser(() => ({");
  });

  test("match as a statement in a handler becomes a chain of if statements", () => {
    const output = transform(
      narrowing(`const f = () => {
        remote.match("kind", {
          ok: (r) => r.focus("page").update((n) => n + 1),
          idle: () => remote.set({ kind: "ok", page: 1 }),
        });
      };`),
    );
    expect(output).toContain('if (remote.kind === "ok") {');
    expect(output).toContain('} else if (remote.kind === "idle") {');
    expect(output).not.toContain("undefined");
  });

  test("a value that is not a plain reference is computed once for a statement too", () => {
    const output = transform(
      narrowing(`const f = () => {
        user.derive((u) => u?.name ?? null).when((n) => n !== null, { narrowed: () => user.set(null) });
      };`),
    );
    expect(output).toContain("const value = user?.name ?? null;\n      if (value !== null) {");
  });

  test("when as a statement in an effect depends on the value it narrows", () => {
    const output = transform(
      narrowing(`reactive.effect(() => {
        user.when((u) => u !== null, { narrowed: () => remote.set({ kind: "ok", page: 1 }) });
      });`),
    );
    expect(output).toContain("if (user !== null) {");
    expect(dependencies(output)).toBe("[user]");
  });

  test("void when(...) keeps the expression", () => {
    const output = transform(
      narrowing(
        `const f = () => void user.when((u) => u !== null, { narrowed: (u) => u.set(null) });`,
      ),
    );
    expect(output).toContain(
      "const f = () => void (user !== null ? setUser(prev => prev !== null ? null : prev) : undefined);",
    );
  });

  test("an error about where the result of when is used points at the call", () => {
    const code = component(
      "const f = () => [cnt.when((n) => n !== 0, { narrowed: (n) => n.derive(String) })];",
    );
    let message = "";
    try {
      transform(code);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/cannot be used as a plain value here/);
    expect(message).toContain("> 6 |");
    expect(message).not.toContain("internal");
  });
});

/** Babel prints one property per line. Tests about shape compare on one line */
const flat = (code: string): string => code.replace(/\s+/g, " ");

// The output must type-check once `Reactive<T>` is the plain `{ value, update }` (after eject)
describe("types in the output", () => {
  const sugar = `import { reactive, type Derived, type Reactive } from "react-preprocessor";\n`;

  test("a parameter of a custom hook keeps its annotation on the destructuring", () => {
    const output = flat(
      transform(`${sugar}
        export const useDoubled = (source: Derived<number>): Derived<number> => source.derive((n) => n * 2);
        export const useReset = (target: Reactive<number>, label: string) => () => target.set(0);
      `),
    );
    expect(output).toContain(
      "useDoubled = ({ value: source }: Derived<number>): Derived<number> => ({ value: source * 2 })",
    );
    expect(output).toContain(
      "useReset = ({ value: target, update: setTarget }: Reactive<number>, label: string) =>",
    );
  });

  test("a received value bound with an annotation keeps it on the destructuring", () => {
    const output = flat(
      transform(`${sugar}
        declare const useX: () => Reactive<number>;
        export const C = () => {
          const x: Reactive<number> = useX();
          const y: Derived<number> = useX();
          return <button onClick={() => x.set(1)}>{x}{y}</button>;
        };
      `),
    );
    expect(output).toContain("const { value: x, update: setX }: Reactive<number> = useX();");
    expect(output).toContain("const { value: y }: Derived<number> = useX();");
  });

  const from = (binding: string, filename?: string): string =>
    flat(
      transform(
        `${filename ? `import { reactive } from "react-preprocessor";` : sugar}
        export const C = ({ state, dispatch, apply, wrap }) => {
          ${binding}
          return <button onClick={() => n.update((v) => v + 1)}>{n}</button>;
        };
      `,
        filename,
      ),
    );

  test("the updater of reactive.from gets the type reactive.from gave it", () => {
    expect(from(`const n = reactive.from(state, (f) => dispatch(f));`)).toContain(
      "const n = state, setN: (f: (old: typeof n) => typeof n) => void = f => dispatch(f);",
    );
    // The value need not be something `typeof` accepts: the type is asked of the variable
    expect(from(`const n = reactive.from(state.a + 1, wrap((f) => dispatch(f)));`)).toContain(
      "const n = state.a + 1, setN: (f: (old: typeof n) => typeof n) => void = wrap(f => dispatch(f));",
    );
  });

  test("a T written in the source is used for the updater of reactive.from", () => {
    expect(from(`const n: Reactive<number> = reactive.from(state, (f) => dispatch(f));`)).toContain(
      "const n = state, setN: (f: (old: number) => number) => void = f => dispatch(f);",
    );
    expect(from(`const n = reactive.from<number>(state, (f) => dispatch(f));`)).toContain(
      "const n = state, setN: (f: (old: number) => number) => void = f => dispatch(f);",
    );
  });

  test("an updater of reactive.from that has its own type is left as written", () => {
    expect(
      from(`const n = reactive.from(state, (f: (old: number) => number) => dispatch(f));`),
    ).toContain("const n = state, setN = (f: (old: number) => number) => dispatch(f);");
    expect(from(`const n = reactive.from(state, apply);`)).toContain(
      "const n = state, setN = apply;",
    );
    expect(from(`const n = reactive.from(state, dispatch.apply);`)).toContain(
      "const n = state, setN = dispatch.apply;",
    );
  });

  test("a JavaScript file gets no type", () => {
    expect(from(`const n = reactive.from(state, (f) => dispatch(f));`, "input.jsx")).toContain(
      "const n = state, setN = f => dispatch(f);",
    );
  });
});

describe("names in types", () => {
  const sugar = `import { reactive, type Reactive } from "react-preprocessor";\n`;
  const withTypes = (lines: string): string =>
    transform(`${sugar}
      export const C = ({ state, dispatch }: { state: number; dispatch: (f: (n: number) => number) => void }) => {
        const n = reactive.from(state, (f: (n: number) => number) => dispatch(f));
        ${lines}
        return <button onClick={() => n.update((v) => v + 1)}>{n}</button>;
      };
    `);

  test("a parameter name of a function type is not the reactive value of the same name", () => {
    expect(flat(withTypes(""))).toContain(
      "const n = state, setN = (f: (n: number) => number) => dispatch(f);",
    );
  });

  test("members and declarations of types named like a reactive value are left alone", () => {
    const output = withTypes(`
      type Shape = { n: number; f(n: number): void };
      type n = number;
      interface Box { n: n }
      const id = <n,>(value: n): n => value;
      const box: Box & Shape = { n: 1, f: (n) => void n };
    `);
    expect(output).toContain("type n = number;");
    expect(output).toContain("n: n;");
    expect(output).toContain("const id = <n,>(value: n): n => value;");
  });

  test("`typeof` of a reactive value in a type is left as written", () => {
    const output = withTypes(`
      const same = (value: typeof n): value is typeof n => true;
      const cast = (value: unknown) => value as typeof n satisfies unknown;
      const list = new Array<typeof n>();
    `);
    expect(output).toContain("const same = (value: typeof n): value is typeof n => true;");
    expect(output).toContain(
      "const cast = (value: unknown) => value as typeof n satisfies unknown;",
    );
    expect(output).toContain("const list = new Array<typeof n>();");
  });

  test("outside a type, the same name is still the reactive value", () => {
    expect(() => withTypes("const next: number = n + 1;")).toThrow(
      /cannot be used as a plain value/,
    );
  });
});

describe("type-aware props", () => {
  const typed = join(import.meta.dirname, "typed");
  const read = (name: string): [code: string, file: string] => {
    const file = join(typed, name);
    return [readFileSync(file, "utf8"), file];
  };

  test("props declared in another file are resolved by the type checker", async () => {
    const [code, file] = read("Item.tsx");
    const output = transform(code, file, true);
    expect(output).not.toMatch(/\.(derive|focus|update)\(|\$\(/);
    await expect(output).toMatchFileSnapshot(join(typed, "output", "Item.tsx"));
  });

  for (const name of ["hooks.ts", "Hooks.tsx"]) {
    test(`custom hooks, Context, and plain values: ${name}`, async () => {
      const [code, file] = read(name);
      const output = transform(code, file, true);
      expect(output).not.toMatch(/reactive\.|\.(focus|update)\(|\$\(/);
      await expect(output).toMatchFileSnapshot(join(typed, "output", name));
    });
  }

  test("when and each on a value returned from a hook may return reactive values", () => {
    const [code, file] = read("Narrowed.tsx");
    const output = transform(code, file, true);
    expect(output).toContain('value2 => value2 ? value2 ? "yes" : "no" : value2 ? "yes" : "no"');
    expect(output).toContain("useNames().value.map(name => <li key={name}>{name}</li>)");
  });

  test("a reactive value cannot be passed to a function that does not take one", () => {
    const [code, file] = read("Leak.tsx");
    expect(() => transform(code, file, true)).toThrow(/cannot be used as a plain value/);
  });

  test("a reactive value bound in a form that is not unpacked is rejected, not left as the box", () => {
    const [code, file] = read("Boxed.tsx");
    expect(() => transform(code, file, true)).toThrow(
      /The reactive value `on` must be bound with `const` to a plain name/,
    );
  });

  test("without types, props declared in another file are not recognised", () => {
    // Reading a missed value with `$` is an error instead of passing silently
    const [code, file] = read("Item.tsx");
    expect(() => transform(code, file, false)).toThrow(/`\$` expects a reactive value/);
  });

  test("a file without components is left untouched", () => {
    const [code, file] = read("types.ts");
    expect(transform(code, file, true)).toContain("Reactive<Todo>");
  });

  test("an optional reactive prop is rejected", () => {
    const [code, file] = read("Optional.tsx");
    expect(() => transform(code, file, true)).toThrow(/`value` cannot be optional/);
  });

  test("code that differs from the file on disk is rejected", () => {
    const [code, file] = read("Item.tsx");
    expect(() => transform(`${code}\n// edited`, file, true)).toThrow(/differs from/);
  });
});

describe("several tsconfig projects", () => {
  test("results for one project do not leak into another", () => {
    // Type ids are assigned per project. Reusing a result from another project
    // would mistake a plain value for a reactive value
    const typed = join(import.meta.dirname, "typed");
    for (const name of ["Item.tsx", "Hooks.tsx", "hooks.ts"]) {
      const file = join(typed, name);
      transform(readFileSync(file, "utf8"), file, true);
    }
    const file = join(import.meta.dirname, "other-project", "Plain.tsx");
    const output = transform(readFileSync(file, "utf8"), file, true);
    expect(output).toContain("{required && <span>*</span>}");
    expect(output).not.toContain("value:");
  });
});

describe("receiving a reactive value", () => {
  const hook = (binding: string): string => `
    import { reactive, type Reactive } from "react-preprocessor";
    declare const useOne: () => Reactive<number>;
    export const C = () => {
      ${binding}
      return <button onClick={() => on.update((n) => n + 1)}>{on}</button>;
    };
  `;

  test("under a type assertion, the value is unpacked", () => {
    for (const binding of [
      "const on: Reactive<number> = useOne()!;",
      "const on: Reactive<number> = useOne() as Reactive<number>;",
    ]) {
      expect(transform(hook(binding))).toContain("const {\n    value: on,\n    update: setOn\n  }");
    }
  });

  test("a form that would leave the box in place is rejected", () => {
    expect(() => transform(hook("let on: Reactive<number> = useOne();"))).toThrow(
      /The reactive value `on` must be bound with `const` to a plain name, directly to what gives it/,
    );
  });

  test("an item of an array received from a hook is unpacked", () => {
    const code = `
      import { reactive, type Reactive } from "react-preprocessor";
      export const usePair = (): [Reactive<number>, () => void] => {
        const on = reactive.new(0);
        return [on, () => on.set(0)];
      };
    `;
    const output = transform(code);
    expect(output).toContain(
      "return [{\n    value: on,\n    update: setOn\n  }, () => setOn(() => 0)];",
    );
  });
});
