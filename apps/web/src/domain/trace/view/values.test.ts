import { readFileSync } from "node:fs";

import { parseTrace } from "@codewalk/trace";
import { expect, test } from "vitest";

import { preview, sharedObjects, valueChildren } from "./values.ts";

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

test("a preview names a type only when it is not its kind's plain type", () => {
  const trace = fixture("values");

  expect(previews(trace, "args")[0]).toBe("tuple ['x', 'y']");
  expect(previews(trace, "kwargs")[0]).toBe("{'extra': 1}");
  expect(previews(trace, "item")[0]).toBe("Loud()");
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

  expect(valueChildren(trace, pair.value, pair.at)).toEqual({
    rows: [
      { key: "0", value: { ref: 0 } },
      { key: "1", value: { ref: 0 } },
    ],
    more: 0,
  });
  expect([...sharedObjects(trace, pair.value, pair.at)]).toEqual([0]);
  expect([...sharedObjects(trace, head.value, head.at)]).toEqual([3]);
  expect(entry?.key).toBe("'a'");
  expect(entry?.value).toEqual({ ref: 6 });
});
