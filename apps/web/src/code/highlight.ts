import { HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const codeHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "#737373", fontStyle: "italic" },
  { tag: [tags.keyword, tags.modifier], color: "#75556f" },
  { tag: [tags.name, tags.variableName], color: "#30343b" },
  { tag: [tags.function(tags.variableName), tags.className], color: "#3f6470" },
  { tag: [tags.string, tags.special(tags.string)], color: "#61714a" },
  { tag: [tags.number, tags.bool, tags.null], color: "#8a6846" },
  { tag: [tags.operator, tags.punctuation], color: "#666b73" },
  { tag: tags.invalid, color: "#a14343", textDecoration: "underline" },
]);
