import type { Maybe } from "./types.ts";

export const Optional = (props: Maybe) => <i>{props.value?.derive((v) => v)}</i>;
