export type Token = { kind: Kind | null; text: string };

type Kind = "comment" | "string" | "keyword" | "number" | "tag" | "type" | "call";

const keywords =
  "import|from|export|default|const|let|return|type|interface|new|if|else|as|function|async|await|typeof|null|undefined|true|false";

// One alternative per kind, in the order of `kinds`. A small tokenizer is enough for the snippets shown here.
// It runs on every keystroke in the editor, so every alternative must stay linear:
// an unterminated comment or string is still one token (a string in quotes ends with its line),
// and a call is only tried at the start of a word
const pattern = new RegExp(
  [
    String.raw`(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))`,
    String.raw`("(?:[^"\\\n]|\\[\s\S]?)*"?|'(?:[^'\\\n]|\\[\s\S]?)*'?|\`(?:[^\`\\]|\\[\s\S]?)*\`?)`,
    String.raw`((?<![.\w$])(?:${keywords})(?![\w$]))`,
    String.raw`(\b\d[\d_.]*\b)`,
    String.raw`((?<![\w)\]])<\/?[a-z][\w-]*)`,
    String.raw`(\b[A-Z]\w*\b)`,
    String.raw`((?<![\w$])[\w$]+(?=\())`,
  ].join("|"),
  "g",
);

const kinds: Kind[] = ["comment", "string", "keyword", "number", "tag", "type", "call"];

export const highlight = (code: string): Token[] => {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of code.matchAll(pattern)) {
    if (match.index > last) tokens.push({ kind: null, text: code.slice(last, match.index) });
    const kind = kinds[match.slice(1).findIndex((group) => group !== undefined)] ?? null;
    tokens.push({ kind, text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < code.length) tokens.push({ kind: null, text: code.slice(last) });
  return tokens;
};
