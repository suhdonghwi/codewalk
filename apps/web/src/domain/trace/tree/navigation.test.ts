import { readFileSync } from "node:fs";

import { parseTrace } from "@codewalk/trace";
import { expect, test } from "vitest";

import { exceptionPath, outputPath } from "./navigation.ts";

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

test("the nested fact output opens every activation down to the one that printed", () => {
  expect(outputPath(fixture("fact"), 3)).toEqual([0, 12, 16, 23]);
});

test("the second callback output opens the second activation instead of the first", () => {
  expect(outputPath(fixture("native_callback"), 1)).toEqual([0, 9]);
});

test("an uncaught exception opens the activation that raised", () => {
  expect(exceptionPath(fixture("uncaught_exception"))).toEqual([0, 4]);
});

test("caught exceptions and successful traces do not open an exception path", () => {
  expect(exceptionPath(fixture("caught_exception"))).toBeNull();
  expect(exceptionPath(fixture("fact"))).toBeNull();
});
