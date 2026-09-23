import type { Piece, PieceKind } from "./values.ts";

const PIECE_CLASSES: Record<PieceKind, string | undefined> = {
  number: "text-syntax-number",
  string: "text-syntax-string",
  keyword: "text-syntax-keyword",
  punctuation: "text-syntax-punctuation",
  type: "text-syntax-type",
  muted: "text-neutral-400",
  plain: undefined,
};

export function PreviewText({ pieces }: { pieces: Piece[] }) {
  return pieces.map((piece, index) => (
    <span className={PIECE_CLASSES[piece.kind]} key={index}>
      {piece.text}
    </span>
  ));
}
