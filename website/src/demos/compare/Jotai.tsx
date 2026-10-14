import { atom, useAtom, useAtomValue, type PrimitiveAtom } from "jotai";
import { splitAtom } from "jotai/utils";
import { useEffect } from "react";

type Todo = { id: number; title: string; done: boolean };

const todosAtom = atom<Todo[]>([]);
const todoAtomsAtom = splitAtom(todosAtom);
const leftAtom = atom((get) => get(todosAtom).filter((t) => !t.done).length);

const Item = ({ todoAtom }: { todoAtom: PrimitiveAtom<Todo> }) => {
  const [todo, setTodo] = useAtom(todoAtom);
  return <li onClick={() => setTodo((t) => ({ ...t, done: !t.done }))}>{todo.title}</li>;
};

export const Todos = ({ owner }: { owner: string }) => {
  const todoAtoms = useAtomValue(todoAtomsAtom);
  const left = useAtomValue(leftAtom);

  useEffect(() => {
    document.title = `${owner}: ${left} left`;
  }, [owner, left]);

  return (
    <ul>
      {todoAtoms.map((todoAtom) => (
        <Item key={`${todoAtom}`} todoAtom={todoAtom} />
      ))}
    </ul>
  );
};
