import { objectAt } from "@codewalk/trace";
import { match } from "ts-pattern";

import type { HeapObject, ObjectId, Trace, Value } from "@codewalk/trace";

export interface ValueRow {
  key: string | null;
  value: Value;
}

export interface ValueChildren {
  rows: ValueRow[];
  more: number;
}

interface Layout {
  opening: string;
  closing: string;
  parts: ((budget: number) => string)[];
  total: number;
}

const KEY_BUDGET = 24;

function cut(text: string, budget: number): string {
  return text.length > budget
    ? `${text.slice(0, Math.max(budget - 1, 0))}…`
    : text;
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
  write: (value: Value, budget: number) => string,
): Layout {
  const label = typeLabel(trace, object);
  const prefix = label === null ? "" : `${label} `;

  return match(object)
    .with({ kind: "sequence" }, { kind: "set" }, ({ kind, items, length }) => ({
      opening: `${prefix}${kind === "set" ? "{" : "["}`,
      closing: kind === "set" ? "}" : "]",
      parts: items.map((item) => (budget: number) => write(item, budget)),
      total: length ?? items.length,
    }))
    .with({ kind: "mapping" }, ({ entries, length }) => ({
      opening: `${prefix}{`,
      closing: "}",
      parts: entries.map(([key, item]) => (budget: number) => {
        const shown = `${write(key, Math.min(budget, KEY_BUDGET))}: `;

        return `${shown}${write(item, budget - shown.length)}`;
      }),
      total: length ?? entries.length,
    }))
    .with({ kind: "record" }, ({ type, fields, length }) => ({
      opening: `${type}(`,
      closing: ")",
      parts: fields.map(
        ([name, item]) =>
          (budget: number) =>
            `${name}=${write(item, budget - name.length - 1)}`,
      ),
      total: length ?? fields.length,
    }))
    .with({ kind: "opaque" }, ({ text }) => ({
      opening: text,
      closing: "",
      parts: [],
      total: 0,
    }))
    .exhaustive();
}

function more(count: number): string {
  return `… ${count} more`;
}

function joinWithin(framing: Layout, budget: number): string {
  let text = framing.opening;

  for (const [index, part] of framing.parts.entries()) {
    const separator = index === 0 ? "" : ", ";
    const remaining = framing.total - index - 1;
    const reserve = remaining > 0 ? `, ${more(remaining)}`.length : 0;
    const room = budget - text.length - separator.length - reserve;
    const piece = part(room - framing.closing.length);
    const candidate = `${text}${separator}${piece}`;

    if (
      index > 0 &&
      candidate.length + reserve + framing.closing.length > budget
    ) {
      return `${text}, ${more(framing.total - index)}${framing.closing}`;
    }

    text = candidate;
  }

  const shown = framing.parts.length;

  if (shown < framing.total) {
    text = `${text}${shown === 0 ? "" : ", "}${more(framing.total - shown)}`;
  }

  return `${text}${framing.closing}`;
}

function collapsed(
  trace: Trace,
  value: Value,
  at: number,
  budget: number,
): string {
  if (!("ref" in value)) return cut(value.text, budget);

  const object = objectAt(trace, value.ref, at);

  if (object === null) return "…";

  if (object.text !== undefined) return cut(object.text, budget);

  const { opening, closing } = layout(trace, object, () => "");

  return `${opening}…${closing}`;
}

function writeValue(
  trace: Trace,
  value: Value,
  at: number,
  budget: number,
  open: Set<ObjectId>,
): string {
  if (!("ref" in value)) return collapsed(trace, value, at, budget);

  const object = objectAt(trace, value.ref, at);

  if (object === null || object.text !== undefined) {
    return collapsed(trace, value, at, budget);
  }

  const nested = (item: Value, room: number) => {
    const whole = writeValue(trace, item, at, Number.POSITIVE_INFINITY, open);

    return whole.length <= room ? whole : collapsed(trace, item, at, room);
  };

  const framing = layout(trace, object, nested);

  if (open.has(value.ref)) {
    return `${framing.opening}…${framing.closing}`;
  }

  open.add(value.ref);
  const text = joinWithin(framing, budget);
  open.delete(value.ref);

  return text;
}

export function preview(
  trace: Trace,
  value: Value,
  at: number,
  budget: number,
): string {
  return writeValue(trace, value, at, budget, new Set());
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
      rows: items.map((item, index) => ({ key: String(index), value: item })),
      more: (length ?? items.length) - items.length,
    }))
    .with({ kind: "set" }, ({ items, length }) => ({
      rows: items.map((item) => ({ key: null, value: item })),
      more: (length ?? items.length) - items.length,
    }))
    .with({ kind: "mapping" }, ({ entries, length }) => ({
      rows: entries.map(([key, item]) => ({
        key: preview(trace, key, at, KEY_BUDGET),
        value: item,
      })),
      more: (length ?? entries.length) - entries.length,
    }))
    .with({ kind: "record" }, ({ fields, length }) => ({
      rows: fields.map(([name, item]) => ({ key: name, value: item })),
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
