import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const codeHighlightStyle = HighlightStyle.define([
  {
    tag: tags.comment,
    color: "var(--syntax-comment)",
    fontStyle: "italic",
  },
  { tag: [tags.keyword, tags.modifier], color: "var(--syntax-keyword)" },
  { tag: [tags.name, tags.variableName], color: "var(--syntax-name)" },
  {
    tag: [tags.function(tags.variableName), tags.className],
    color: "var(--syntax-type)",
  },
  {
    tag: [tags.string, tags.special(tags.string)],
    color: "var(--syntax-string)",
  },
  {
    tag: [tags.number, tags.bool, tags.null],
    color: "var(--syntax-number)",
  },
  {
    tag: [tags.operator, tags.punctuation],
    color: "var(--syntax-punctuation)",
  },
  {
    tag: tags.invalid,
    color: "var(--syntax-invalid)",
    textDecoration: "underline",
  },
]);
