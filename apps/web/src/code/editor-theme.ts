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
    padding: "7px 0",
    caretColor: "#262626",
  },
  ".cm-line": {
    padding: "0 10px 0 6px",
  },
  ".cm-gutters": {
    color: "#a3a3a3",
    backgroundColor: "#ffffff",
    borderRight: "0",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "34px",
    padding: "0 7px 0 6px",
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
