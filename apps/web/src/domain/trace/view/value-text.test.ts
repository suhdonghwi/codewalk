import { readFileSync } from "node:fs";

import { parseTrace } from "@codewalk/trace";
import { expect, test } from "vitest";

import { valueKey } from "./value-text.ts";

import type { Trace } from "@codewalk/trace";

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

test("a value previews the objects as they were at its event and stops at a cycle", () => {
  const trace = fixture("object_identity");

  const previews = (name: string) =>
    trace.nodes.flatMap((node) =>
      node.values
        .filter((chunk) => chunk.name === name)
        .map((chunk) => valueKey(trace, chunk)),
    );

  expect(previews("shared")).toEqual(["[]", "[Point(x=1, y=2)]"]);
  expect(previews("head")).toEqual([
    "Node(value=1, next=Node(value=2, next=None))",
    "Node(value=1, next=Node(value=2, next=…))",
  ]);
});
