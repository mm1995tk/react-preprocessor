import { reactive } from "react-preprocessor";

type User = { name: string };
type Folders = { kind: "idle" } | { kind: "loading" } | { kind: "ok"; names: string[] };

export const Account = () => {
  const user = reactive.new<User | null>(null);
  const folders = reactive.new<Folders>({ kind: "idle" });

  const load = () => {
    folders.set({ kind: "loading" });
    setTimeout(() => folders.set({ kind: "ok", names: ["inbox", "drafts"] }), 800);
  };

  return (
    <>
      {user.when((u) => u !== null, {
        // Narrowed to User, and still writable: an update is written back through the guard
        narrowed: (u) => (
          <p>
            <input value={u.focus("name")} onChange={(e) => u.focus("name").set(e.target.value)} />
            <button onClick={() => user.set(null)}>log out</button>
          </p>
        ),
        rest: () => <button onClick={() => user.set({ name: "ada" })}>log in</button>,
      })}
      {folders.match("kind", {
        idle: () => <button onClick={load}>load folders</button>,
        loading: () => <progress />,
        ok: (f) => (
          <ul>
            {f.focus("names").each(
              (name) => name,
              (name) => (
                <li>{name}</li>
              ),
            )}
          </ul>
        ),
      })}
    </>
  );
};
