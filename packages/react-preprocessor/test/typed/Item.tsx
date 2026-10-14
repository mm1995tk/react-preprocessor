import type { FC } from "react";
import { $, reactive } from "react-preprocessor";
import type { ItemProps } from "./types.ts";

// The props type lives in another file. Syntax alone cannot tell which props are reactive values

// Destructuring
export const Item = ({ todo, count, label, onRemove }: ItemProps) => (
  <li>
    {label} {count} {todo.derive((t) => t.title)}
    <button onClick={() => todo.focus("done").update((done) => !done)}>toggle</button>
    <button onClick={reactive.handler(() => onRemove($(todo).id))}>remove</button>
  </li>
);

// A type derived from another type, and props.xxx
export const Title = (props: Pick<ItemProps, "todo" | "label">) => (
  <b>
    {props.label}: {props.todo.derive((t) => t.title)}
  </b>
);

// The parameter has no type annotation; its type comes from the variable's type
export const Count: FC<ItemProps> = ({ count }) => <i>{count}</i>;

// A component that receives no reactive value is left as is
export const Plain = ({ label }: { label: string }) => <span>{label}</span>;
