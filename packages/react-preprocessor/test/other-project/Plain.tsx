// A plain component that uses no reactive value at all. It must not be transformed
export function Plain({ label, required }: { label: string; required?: boolean }) {
  return (
    <label>
      {label}
      {required && <span>*</span>}
    </label>
  );
}

export function Other({ a, b, c, d }: { a?: number; b?: string; c?: boolean; d?: string[] }) {
  return <p>{[a, b, c, d].filter(Boolean).length}</p>;
}
