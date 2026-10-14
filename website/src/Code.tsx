import { highlight } from "./highlight.ts";

/** Highlighted code. `plain` skips the highlighting, for shell commands and error messages */
export const Highlighted = ({ code, plain = false }: { code: string; plain?: boolean }) =>
  plain
    ? code
    : highlight(code).map((token, index) =>
        token.kind ? (
          // oxlint-disable-next-line react/no-array-index-key -- tokens have no identity of their own
          <span key={index} className={`tok-${token.kind}`}>
            {token.text}
          </span>
        ) : (
          token.text
        ),
      );

export const Code = ({ code, plain }: { code: string; plain?: boolean }) => (
  <pre className="code">
    <code>
      <Highlighted code={code.trimEnd()} plain={plain} />
    </code>
  </pre>
);
