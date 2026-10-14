import type { Reactive } from "react-preprocessor";

export type Todo = { id: number; title: string; done: boolean };

// Even when the props type lives in another file, the preprocessor finds it by asking the type checker
export type ItemProps = { todo: Reactive<Todo>; onRemove: (id: number) => void };
