import { EditorView } from "@codemirror/view";

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--color-code-foreground)",
    backgroundColor: "#ffffff",
    fontFamily: "var(--font-code)",
    fontSize: "var(--text-code)",
    lineHeight: "1.5",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
    lineHeight: "inherit",
  },
  ".cm-content": {
    minWidth: "max-content",
    padding: "8px 0",
    caretColor: "#262626",
  },
  ".cm-line": {
    padding: "0 10px",
  },
  ".cm-gutters": {
    color: "var(--color-line-number)",
    backgroundColor: "#ffffff",
    borderRight: "1px solid var(--color-gutter-divider)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "36px",
    padding: "0 8px 0 6px",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-syntax-error": {
    textDecorationColor: "var(--color-exception)",
    textDecorationLine: "underline",
    textDecorationStyle: "wavy",
    textDecorationThickness: "1px",
    textUnderlineOffset: "2px",
  },
});
