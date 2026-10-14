import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import { Highlighted } from "./Code.tsx";

const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
  const area = event.currentTarget;
  const start = area.selectionStart;
  const line = area.value.slice(0, start).split("\n").at(-1)!;
  // execCommand keeps the caret and the undo history, which setting the value does not
  const insert = (text: string) => {
    event.preventDefault();
    document.execCommand("insertText", false, text);
  };

  if (event.key === "Escape") {
    // Tab indents, so the keyboard needs another way out of the editor
    area.blur();
  } else if (event.key === "Tab" && !event.shiftKey) {
    insert("  ");
  } else if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
    insert(`\n${/^\s*/.exec(line)![0]}${/[{([>]\s*$/.test(line) ? "  " : ""}`);
  } else if (event.key === "}" || event.key === ")" || event.key === "]") {
    // A closing bracket typed on an empty line goes back one level
    if (start !== area.selectionEnd || !/^\s{2,}$/.test(line)) return;
    area.setSelectionRange(start - 2, start);
    insert(event.key);
  }
};

/** A small code editor: a transparent text area on top of a highlighted copy of its text */
export const Editor = ({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) => {
  const backdrop = useRef<HTMLPreElement>(null);
  return (
    <div className="editor" style={{ "--lines": value.split("\n").length } as CSSProperties}>
      <pre className="code" aria-hidden="true" ref={backdrop}>
        <code>
          <Highlighted code={value} />
          {"\n"}
        </code>
      </pre>
      <textarea
        aria-label={label}
        aria-description="Tab indents. Press Escape to leave the editor."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          const pre = backdrop.current;
          if (!pre) return;
          pre.scrollTop = event.currentTarget.scrollTop;
          pre.scrollLeft = event.currentTarget.scrollLeft;
        }}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
      />
    </div>
  );
};
