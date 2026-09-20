import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import {
  bracketMatching,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";

import { editorTheme } from "./editor-theme.ts";
import { codeHighlightStyle } from "./highlight.ts";
import { syntaxErrorExtension } from "./syntax-error.ts";

export function editorExtensions(
  onChange: (source: string) => void,
): Extension[] {
  return [
    lineNumbers(),
    history(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
    ]),
    python(),
    indentUnit.of("    "),
    bracketMatching(),
    closeBrackets(),
    syntaxHighlighting(codeHighlightStyle),
    syntaxErrorExtension,
    editorTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange(update.state.doc.toString());
    }),
  ];
}
