import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";

import type { Extension } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";

export interface SyntaxErrorRange {
  from: number;
  to: number;
}

export const setSyntaxError = StateEffect.define<SyntaxErrorRange | null>();

export function syntaxErrorRange(
  documentLength: number,
  start: number,
  end: number,
): SyntaxErrorRange | null {
  if (documentLength === 0) return null;

  const from = Math.min(start, documentLength);
  const to = Math.min(Math.max(end, from), documentLength);

  if (from < to) return { from, to };

  return from === documentLength
    ? { from: documentLength - 1, to: documentLength }
    : { from, to: from + 1 };
}

const syntaxErrorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged) return Decoration.none;

    const effect = transaction.effects.find((candidate) =>
      candidate.is(setSyntaxError),
    );

    if (effect === undefined || effect.value === null) {
      return effect === undefined ? value : Decoration.none;
    }

    const range = syntaxErrorRange(
      transaction.newDoc.length,
      effect.value.from,
      effect.value.to,
    );

    return range === null
      ? Decoration.none
      : Decoration.set([
          Decoration.mark({ class: "cm-syntax-error" }).range(
            range.from,
            range.to,
          ),
        ]);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const syntaxErrorExtension: Extension = syntaxErrorField;
