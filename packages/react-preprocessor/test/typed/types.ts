import type { Derived, Reactive } from "react-preprocessor";

export type Todo = { id: number; title: string; done: boolean };

// Non-ASCII characters on purpose (é → ∀): checks how positions are counted (UTF-16 or UTF-8)
export type ItemProps = {
  todo: Reactive<Todo>;
  count: Derived<number>;
  label: string;
  onRemove: (id: number) => void;
};

export type Maybe = { value?: Reactive<number> };
