import { reactive, type Reactive } from "react-preprocessor";

const Button = ({ disabled, label }: { disabled: boolean; label: string }) => (
  <button disabled={disabled}>{label}</button>
);

const Checkbox = ({ checked }: { checked: Reactive<boolean> }) => (
  <input type="checkbox" checked={checked} onChange={() => checked.update((c) => !c)} />
);

const Field = ({ onText, onClear }: { onText: (text: string) => void; onClear: () => void }) => (
  <input onChange={(e) => onText(e.target.value)} onBlur={onClear} />
);

export const Form = () => {
  const text = reactive.new("");
  const pending = reactive.new(false);
  const agreed = reactive.new(false);
  const empty = text.derive((value) => value.trim() === "");

  const submit = () => {
    pending.set(true);
    text.set("");
  };

  return (
    <form onSubmit={submit}>
      {/* Attributes of DOM elements get plain values */}
      <input value={text} onChange={(e) => text.set(e.target.value)} disabled={pending} />
      {/* Components that take plain values get plain values too */}
      <Button disabled={empty} label="send" />
      {/* A prop declared as a reactive value gets the value as is */}
      <Checkbox checked={agreed} />
      {/* update and set can be passed as functions without calling them */}
      <Field onText={text.set} onClear={() => text.set("")} />
      <output aria-busy={pending}>{text}</output>
    </form>
  );
};
