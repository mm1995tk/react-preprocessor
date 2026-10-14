import { useState } from "react";
import type { Reactive } from "react-preprocessor";
const Button = ({
  disabled,
  label
}: {
  disabled: boolean;
  label: string;
}) => <button disabled={disabled}>{label}</button>;
const Checkbox = ({
  checked: {
    value: checked,
    update: setChecked
  }
}: {
  checked: Reactive<boolean>;
}) => <input type="checkbox" checked={checked} onChange={() => setChecked(c => !c)} />;
const Field = ({
  onText,
  onClear
}: {
  onText: (text: string) => void;
  onClear: () => void;
}) => <input onChange={e => onText(e.target.value)} onBlur={onClear} />;
export const Form = () => {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const empty = text.trim() === "";
  const submit = () => {
    setPending(() => true);
    setText(() => "");
  };
  return <form onSubmit={submit}>
      {/* Attributes of DOM elements get plain values */}
      <input value={text} onChange={e => (next => setText(() => next))(e.target.value)} disabled={pending} />
      {/* Components that take plain values get plain values too */}
      <Button disabled={empty} label="send" />
      {/* A prop declared as a reactive value gets the value as is */}
      <Checkbox checked={{
      value: agreed,
      update: setAgreed
    }} />
      {/* update and set can be passed as functions without calling them */}
      <Field onText={next => setText(() => next)} onClear={() => setText(() => "")} />
      <output aria-busy={pending}>{text}</output>
    </form>;
};
