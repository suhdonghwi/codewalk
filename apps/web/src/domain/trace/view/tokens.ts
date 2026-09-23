import { highlightTree } from "@lezer/highlight";
import { parser } from "@lezer/python";
import { StyleModule } from "style-mod";

import { codeHighlightStyle } from "@/domain/editor/index.ts";

export interface Token {
  from: number;
  to: number;
  classes: string;
}

export function tokenizePython(source: string): Token[] {
  const tokens: Token[] = [];

  highlightTree(
    parser.parse(source),
    codeHighlightStyle,
    (from, to, classes) => {
      tokens.push({ from, to, classes });
    },
  );

  return tokens;
}

export function mountCodeHighlightStyle(root: Document): void {
  const styleModule = codeHighlightStyle.module;

  if (styleModule !== null) StyleModule.mount(root, styleModule);
}
