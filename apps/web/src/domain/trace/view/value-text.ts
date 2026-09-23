import { objectAt } from "@codewalk/trace";
import { match } from "ts-pattern";

import type { ObjectId, Trace, Value, ValueChunk } from "@codewalk/trace";

const PREVIEW_LENGTH = 48;

function joined(parts: string[], length: number | undefined): string {
  return length === undefined ? parts.join(", ") : [...parts, "…"].join(", ");
}

function render(
  trace: Trace,
  value: Value,
  at: number,
  open: Set<ObjectId>,
): string {
  if (!("ref" in value)) return value.text;

  const object = objectAt(trace, value.ref, at);

  if (object === null) return "…";

  if (object.text !== undefined) return object.text;

  if (open.has(value.ref)) return "…";

  open.add(value.ref);
  const part = (item: Value) => render(trace, item, at, open);

  const text = match(object)
    .with(
      { kind: "sequence" },
      ({ items, length }) => `[${joined(items.map(part), length)}]`,
    )
    .with(
      { kind: "set" },
      ({ items, length }) => `{${joined(items.map(part), length)}}`,
    )
    .with({ kind: "mapping" }, ({ entries, length }) => {
      const parts = entries.map(([key, item]) => `${part(key)}: ${part(item)}`);

      return `{${joined(parts, length)}}`;
    })
    .with({ kind: "record" }, ({ type, fields, length }) => {
      const parts = fields.map(([name, item]) => `${name}=${part(item)}`);

      return `${type}(${joined(parts, length)})`;
    })
    .with({ kind: "opaque" }, ({ text }) => text)
    .exhaustive();

  open.delete(value.ref);

  return text;
}

export function valueKey(trace: Trace, { value, at }: ValueChunk): string {
  return render(trace, value, at, new Set());
}

export function previewText(key: string): string {
  return key.length > PREVIEW_LENGTH
    ? `${key.slice(0, PREVIEW_LENGTH - 1)}…`
    : key;
}

export function valueText(trace: Trace, chunk: ValueChunk): string {
  return previewText(valueKey(trace, chunk));
}
