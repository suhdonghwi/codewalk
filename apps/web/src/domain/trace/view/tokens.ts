import type { Tree } from "@lezer/common";
import { highlightTree } from "@lezer/highlight";
import { parser } from "@lezer/python";
import { StyleModule } from "style-mod";

import { codeHighlightStyle } from "@/domain/editor/index.ts";

export interface Token {
  from: number;
  to: number;
  classes: string;
}

function collectTokens(tree: Tree): Token[] {
  const tokens: Token[] = [];

  highlightTree(tree, codeHighlightStyle, (from, to, classes) => {
    tokens.push({ from, to, classes });
  });

  return tokens;
}

export function tokenizePython(source: string): Token[] {
  return collectTokens(parser.parse(source));
}

export function mountCodeHighlightStyle(root: Document): void {
  const styleModule = codeHighlightStyle.module;

  if (styleModule !== null) StyleModule.mount(root, styleModule);
}
