import { reactive } from "react-preprocessor";

export const Badge = () => {
  const cnt = reactive.new(0);
  if (cnt) return <span>{cnt}</span>;
  return null;
};
