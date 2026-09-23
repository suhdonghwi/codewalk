import { readFileSync } from "node:fs";

import { parseTrace } from "@codewalk/trace";
import { expect, test } from "vitest";

import {
  pieceText,
  preview,
  previewPieces,
  sharedObjects,
  valueChildren,
} from "./values.ts";

import type { Trace, ValueChunk } from "@codewalk/trace";

function fixture(name: string): Trace {
  const contents = readFileSync(
    new URL(
      `../../../../../../spec/fixtures/${name}.trace.jsonl`,
      import.meta.url,
    ),
    "utf8",
  );

  const parsed = parseTrace(contents);

  if (!parsed.ok) throw new Error(parsed.error.message);

  return parsed.trace;
}

function chunks(trace: Trace, name: string): ValueChunk[] {
  return trace.nodes.flatMap((node) =>
    node.values.filter((chunk) => chunk.name === name),
  );
}

function previews(trace: Trace, name: string, budget = 80): string[] {
  return chunks(trace, name).map(({ value, at }) =>
    preview(trace, value, at, budget),
  );
}

test("a preview stops adding items at its budget and counts the rest", () => {
  const trace = fixture("values");

  const whole = `[${Array.from({ length: 30 }, (_, index) => index).join(", ")}]`;

  expect(previews(trace, "long_values", 20)).toEqual(["[0, 1, 2, … 27 more]"]);
  expect(previews(trace, "long_values", whole.length)).toEqual([whole]);
});

test("a nested object that does not fit its room collapses to its brackets", () => {
  const trace = fixture("object_identity");

  expect(previews(trace, "pair", 20).at(-1)).toBe("[[…], […]]");
  expect(previews(trace, "pair").at(-1)).toBe(
    "[[Point(x=1, y=2)], [Point(x=1, y=2)]]",
  );
});

test("a literal type takes its own brackets and any other type is named", () => {
  const values = fixture("values");
  const identity = fixture("object_identity");

  expect(previews(values, "args")[0]).toBe("('x', 'y')");
  expect(previews(values, "kwargs")[0]).toBe("{'extra': 1}");
  expect(previews(values, "item")[0]).toBe("Loud()");
  expect(previews(identity, "queue")).toEqual(["deque [1, 2]"]);
});

test("a value previews the objects as they were at its event and closes a cycle", () => {
  const trace = fixture("object_identity");

  expect(previews(trace, "shared")).toEqual(["[]", "[Point(x=1, y=2)]"]);
  expect(previews(trace, "head")).toEqual([
    "Node(value=1, next=Node(value=2, next=None))",
    "Node(value=1, next=Node(value=2, next=Node(…)))",
  ]);
  expect(previews(trace, "counts")).toEqual(["{'a': {1, 2}}"]);
});

test("children are keyed rows, and an object reached twice is shared", () => {
  const trace = fixture("object_identity");
  const [pair] = chunks(trace, "pair");
  const head = chunks(trace, "head").at(-1);
  const [counts] = chunks(trace, "counts");

  if (pair === undefined || head === undefined || counts === undefined) {
    throw new Error("missing values");
  }

  const [entry] = valueChildren(trace, counts.value, counts.at)?.rows ?? [];

  const rows = valueChildren(trace, pair.value, pair.at)?.rows ?? [];

  expect(
    rows.map(({ key, value }) => ({ key: pieceText(key ?? []), value })),
  ).toEqual([
    { key: "0", value: { ref: 0 } },
    { key: "1", value: { ref: 0 } },
  ]);
  expect([...sharedObjects(trace, pair.value, pair.at)]).toEqual([0]);
  expect([...sharedObjects(trace, head.value, head.at)]).toEqual([3]);
  expect(pieceText(entry?.key ?? [])).toBe("'a'");
  expect(entry?.value).toEqual({ ref: 6 });
});

test("preview pieces mark literals, punctuation, type names and elisions", () => {
  const trace = fixture("object_identity");
  const counts = chunks(trace, "counts").at(-1);
  const shared = chunks(trace, "shared").at(-1);

  if (counts === undefined || shared === undefined) {
    throw new Error("missing values");
  }

  expect(previewPieces(trace, counts.value, counts.at, 80)).toEqual([
    { kind: "punctuation", text: "{" },
    { kind: "string", text: "'a'" },
    { kind: "punctuation", text: ": " },
    { kind: "punctuation", text: "{" },
    { kind: "number", text: "1" },
    { kind: "punctuation", text: ", " },
    { kind: "number", text: "2" },
    { kind: "punctuation", text: "}" },
    { kind: "punctuation", text: "}" },
  ]);
  expect(previewPieces(trace, shared.value, shared.at, 10)).toEqual([
    { kind: "punctuation", text: "[" },
    { kind: "type", text: "Point" },
    { kind: "punctuation", text: "(" },
    { kind: "muted", text: "…" },
    { kind: "punctuation", text: ")" },
    { kind: "punctuation", text: "]" },
  ]);
});
