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
import {
  EditorView,
  keymap,
  lineNumbers,
  type KeyBinding,
} from "@codemirror/view";

import { editorTheme } from "./editor-theme.ts";
import { codeHighlightStyle } from "./highlight.ts";
import { syntaxErrorExtension } from "./syntax-error.ts";

const leaveRunShortcutToApp: KeyBinding = { key: "Mod-Enter", run: () => true };

export function editorExtensions(
  onChange: (source: string) => void,
): Extension[] {
  return [
    lineNumbers(),
    history(),
    keymap.of([
      leaveRunShortcutToApp,
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
