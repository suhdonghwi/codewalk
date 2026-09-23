import { objectAt } from "@codewalk/trace";
import { match } from "ts-pattern";

import type { HeapObject, ObjectId, Trace, Value } from "@codewalk/trace";

export type PieceKind =
  "number" | "string" | "keyword" | "punctuation" | "type" | "muted" | "plain";

export interface Piece {
  kind: PieceKind;
  text: string;
}

export interface ValueRow {
  key: Piece[] | null;
  value: Value;
}

export interface ValueChildren {
  rows: ValueRow[];
  more: number;
}

interface Layout {
  opening: Piece[];
  closing: Piece[];
  parts: ((budget: number) => Piece[])[];
  total: number;
}

export const PREVIEW_BUDGET = 40;

const KEY_BUDGET = 24;

const PRIMITIVE_PIECES = {
  number: "number",
  string: "string",
  boolean: "keyword",
  null: "keyword",
} as const;

function piece(kind: PieceKind, text: string): Piece {
  return { kind, text };
}

function width(pieces: Piece[]): number {
  return pieces.reduce((total, { text }) => total + text.length, 0);
}

export function pieceText(pieces: Piece[]): string {
  return pieces.map(({ text }) => text).join("");
}

function cut({ kind, text }: Piece, budget: number): Piece[] {
  return [
    piece(
      kind,
      text.length > budget
        ? `${text.slice(0, Math.max(budget - 1, 0))}…`
        : text,
    ),
  ];
}

function typeLabel(trace: Trace, object: HeapObject): string | null {
  return match(object)
    .with({ kind: "record" }, { kind: "opaque" }, ({ type }) => type)
    .with(
      { kind: "sequence" },
      { kind: "set" },
      { kind: "mapping" },
      (plain) =>
        plain.type === trace.header.plain[plain.kind] ? null : plain.type,
    )
    .exhaustive();
}

function layout(
  trace: Trace,
  object: HeapObject,
  write: (value: Value, budget: number) => Piece[],
): Layout {
  const label = typeLabel(trace, object);

  const prefix =
    label === null ? [] : [piece("type", label), piece("plain", " ")];

  return match(object)
    .with({ kind: "sequence" }, { kind: "set" }, ({ kind, items, length }) => ({
      opening: [...prefix, piece("punctuation", kind === "set" ? "{" : "[")],
      closing: [piece("punctuation", kind === "set" ? "}" : "]")],
      parts: items.map((item) => (budget: number) => write(item, budget)),
      total: length ?? items.length,
    }))
    .with({ kind: "mapping" }, ({ entries, length }) => ({
      opening: [...prefix, piece("punctuation", "{")],
      closing: [piece("punctuation", "}")],
      parts: entries.map(([key, item]) => (budget: number) => {
        const shown = [
          ...write(key, Math.min(budget, KEY_BUDGET)),
          piece("punctuation", ": "),
        ];

        return [...shown, ...write(item, budget - width(shown))];
      }),
      total: length ?? entries.length,
    }))
    .with({ kind: "record" }, ({ type, fields, length }) => ({
      opening: [piece("type", type), piece("punctuation", "(")],
      closing: [piece("punctuation", ")")],
      parts: fields.map(([name, item]) => (budget: number) => [
        piece("plain", name),
        piece("punctuation", "="),
        ...write(item, budget - name.length - 1),
      ]),
      total: length ?? fields.length,
    }))
    .with({ kind: "opaque" }, ({ text }) => ({
      opening: [piece("plain", text)],
      closing: [],
      parts: [],
      total: 0,
    }))
    .exhaustive();
}

function more(count: number): Piece {
  return piece("muted", `… ${count} more`);
}

const SEPARATOR = piece("punctuation", ", ");

function joinWithin(framing: Layout, budget: number): Piece[] {
  const closing = width(framing.closing);
  let pieces = [...framing.opening];

  for (const [index, part] of framing.parts.entries()) {
    const separator = index === 0 ? [] : [SEPARATOR];
    const remaining = framing.total - index - 1;

    const reserve =
      remaining > 0 ? SEPARATOR.text.length + more(remaining).text.length : 0;

    const room = budget - width(pieces) - width(separator) - reserve;
    const candidate = [...pieces, ...separator, ...part(room - closing)];

    if (index > 0 && width(candidate) + reserve + closing > budget) {
      return [
        ...pieces,
        SEPARATOR,
        more(framing.total - index),
        ...framing.closing,
      ];
    }

    pieces = candidate;
  }

  const shown = framing.parts.length;

  if (shown < framing.total) {
    pieces = [
      ...pieces,
      ...(shown === 0 ? [] : [SEPARATOR]),
      more(framing.total - shown),
    ];
  }

  return [...pieces, ...framing.closing];
}

function collapsed(
  trace: Trace,
  value: Value,
  at: number,
  budget: number,
): Piece[] {
  if (!("ref" in value)) {
    return cut(piece(PRIMITIVE_PIECES[value.kind], value.text), budget);
  }

  const object = objectAt(trace, value.ref, at);

  if (object === null) return [piece("muted", "…")];

  if (object.text !== undefined)
    return cut(piece("plain", object.text), budget);

  const { opening, closing } = layout(trace, object, () => []);

  return [...opening, piece("muted", "…"), ...closing];
}

function writeValue(
  trace: Trace,
  value: Value,
  at: number,
  budget: number,
  open: Set<ObjectId>,
): Piece[] {
  if (!("ref" in value)) return collapsed(trace, value, at, budget);

  const object = objectAt(trace, value.ref, at);

  if (object === null || object.text !== undefined) {
    return collapsed(trace, value, at, budget);
  }

  const nested = (item: Value, room: number) => {
    const whole = writeValue(trace, item, at, Number.POSITIVE_INFINITY, open);

    return width(whole) <= room ? whole : collapsed(trace, item, at, room);
  };

  const framing = layout(trace, object, nested);

  if (open.has(value.ref)) {
    return [...framing.opening, piece("muted", "…"), ...framing.closing];
  }

  open.add(value.ref);
  const whole = joinWithin(framing, Number.POSITIVE_INFINITY);
  const pieces = width(whole) <= budget ? whole : joinWithin(framing, budget);
  open.delete(value.ref);

  return pieces;
}

export function previewPieces(
  trace: Trace,
  value: Value,
  at: number,
  budget: number,
): Piece[] {
  return writeValue(trace, value, at, budget, new Set());
}

export function preview(
  trace: Trace,
  value: Value,
  at: number,
  budget: number,
): string {
  return pieceText(previewPieces(trace, value, at, budget));
}

export function valueKey(trace: Trace, value: Value, at: number): string {
  return preview(trace, value, at, Number.POSITIVE_INFINITY);
}

export function valueChildren(
  trace: Trace,
  value: Value,
  at: number,
): ValueChildren | null {
  if (!("ref" in value)) return null;

  const object = objectAt(trace, value.ref, at);

  if (object === null) return null;

  const children = match(object)
    .with({ kind: "sequence" }, ({ items, length }) => ({
      rows: items.map((item, index) => ({
        key: [piece("plain", String(index))],
        value: item,
      })),
      more: (length ?? items.length) - items.length,
    }))
    .with({ kind: "set" }, ({ items, length }) => ({
      rows: items.map((item) => ({ key: null, value: item })),
      more: (length ?? items.length) - items.length,
    }))
    .with({ kind: "mapping" }, ({ entries, length }) => ({
      rows: entries.map(([key, item]) => ({
        key: previewPieces(trace, key, at, KEY_BUDGET),
        value: item,
      })),
      more: (length ?? entries.length) - entries.length,
    }))
    .with({ kind: "record" }, ({ fields, length }) => ({
      rows: fields.map(([name, item]) => ({
        key: [piece("plain", name)],
        value: item,
      })),
      more: (length ?? fields.length) - fields.length,
    }))
    .with({ kind: "opaque" }, () => ({ rows: [], more: 0 }))
    .exhaustive();

  return children.rows.length === 0 ? null : children;
}

export function sharedObjects(
  trace: Trace,
  value: Value,
  at: number,
): Set<ObjectId> {
  const reached = new Set<ObjectId>();
  const shared = new Set<ObjectId>();
  const pending = [value];

  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    if (!("ref" in next)) continue;

    if (reached.has(next.ref)) {
      shared.add(next.ref);
      continue;
    }

    reached.add(next.ref);
    const children = valueChildren(trace, next, at);

    if (children === null) continue;

    for (const row of children.rows) pending.push(row.value);

    const object = objectAt(trace, next.ref, at);

    if (object?.kind === "mapping") {
      for (const [key] of object.entries) pending.push(key);
    }
  }

  return shared;
}
