import { Component, useRef, type ComponentType, type ReactNode } from "react";
import { reactive } from "react-preprocessor";
import { Code } from "./Code.tsx";
import { Editor } from "./Editor.tsx";

export type Example = {
  label: string;
  lead: string;
  /** The file and its transform output, made when the site was built */
  code: { source: string; output: string };
  /** The same file, imported as a component */
  live: ReactNode;
};

/** What the page shows for edited code. `null` until the first edit has been compiled */
type Edited = {
  output: string | null;
  error: string | null;
  /** The last version that compiled. It keeps running while the code has an error */
  Component: ComponentType | null;
  /** Changes with every version that compiled, so that each one starts from a fresh state */
  version: number;
} | null;

/** Shows an error thrown while the edited code renders, instead of taking the page down */
class Boundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null };

  static getDerivedStateFromError(thrown: unknown) {
    return { error: thrown instanceof Error ? thrown.message : String(thrown) };
  }

  override render() {
    return this.state.error === null ? (
      this.props.children
    ) : (
      <p className="live-error">{this.state.error}</p>
    );
  }
}

export const Demo = ({ example }: { example: Example }) => {
  const source = reactive.new(example.code.source);
  const edited = reactive.new<Edited>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  /** The number of the latest edit. A compilation that finishes after a newer edit is dropped */
  const latest = useRef(0);

  const run = async (code: string, edit: number) => {
    // Babel and the formatter are large. They are loaded on the first edit
    const { compile } = await import("./live/compile.ts");
    const compiled = await compile(code);
    if (edit !== latest.current) return;
    edited.update((last) =>
      compiled.ok
        ? { output: compiled.output, error: null, Component: compiled.Component, version: edit }
        : {
            output: null,
            error: compiled.error,
            Component: last?.Component ?? null,
            version: last?.version ?? 0,
          },
    );
  };

  const edit = (code: string) => {
    source.set(code);
    const number = ++latest.current;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(code, number), 250);
  };

  const reset = () => {
    latest.current++;
    clearTimeout(timer.current);
    source.set(example.code.source);
    edited.set(null);
  };

  return (
    <>
      <p className="demo-lead">{example.lead}</p>
      <div className="pair">
        <figure className="pane editor-pane">
          <figcaption>
            You write <span className="hint">edit me</span>
            {source.derive((code) =>
              code === example.code.source ? null : (
                <button type="button" onClick={reset}>
                  Reset
                </button>
              ),
            )}
          </figcaption>
          {source.derive((code) => (
            <Editor value={code} onChange={edit} label={`Code of the example: ${example.label}`} />
          ))}
        </figure>
        <div className="pair-arrow" aria-hidden="true">
          {"=>"}
        </div>
        {edited.derive((last) =>
          last?.error ? (
            <figure className="pane error" aria-live="polite">
              <figcaption>Build error</figcaption>
              <Code code={last.error} plain />
            </figure>
          ) : (
            <figure className="pane" aria-live="polite">
              <figcaption>It becomes plain React</figcaption>
              <Code code={last?.output ?? example.code.output} />
            </figure>
          ),
        )}
      </div>
      {/* The running example is made from the plain React, so the arrow leaves from that side */}
      <div className="pair-down" aria-hidden="true">
        <span>{"=>"}</span>
      </div>
      <figure className="pane live">
        <figcaption>Running here</figcaption>
        <div className="live-body">
          {edited.derive((last) => {
            if (last === null) return example.live;
            const { Component: Edited, version } = last;
            if (Edited === null) return <p className="live-error">Export a component to run it.</p>;
            return (
              <Boundary key={version}>
                <Edited />
              </Boundary>
            );
          })}
        </div>
      </figure>
    </>
  );
};
