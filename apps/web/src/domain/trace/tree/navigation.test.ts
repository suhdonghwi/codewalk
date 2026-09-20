import { readFileSync } from "node:fs";

import { parseTrace } from "@codewalk/trace";
import { expect, test } from "vitest";

import {
  navigateToException,
  navigateToNode,
  navigateToOutput,
} from "./navigation.ts";

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

test("the nested fact output opens every activation and focuses its print statement", () => {
  expect(navigateToOutput(fixture("fact"), 3)).toEqual({
    path: [0, 12, 16, 23],
    focus: { kind: "output", block: 23, line: 2, chunk: 3 },
  });
});

test("node navigation uses the end of a multiline range to choose its line", () => {
  expect(navigateToNode(fixture("fact"), 23)).toEqual({
    path: [0, 12, 16, 23],
    block: 23,
    line: 5,
  });
});

test("the second callback output opens the second activation instead of the first", () => {
  expect(navigateToOutput(fixture("native_callback"), 1)).toEqual({
    path: [0, 9],
    focus: { kind: "output", block: 9, line: 2, chunk: 1 },
  });
});

test("an uncaught exception opens fail and focuses its raise statement", () => {
  expect(navigateToException(fixture("uncaught_exception"))).toEqual({
    path: [0, 4],
    focus: { kind: "exception", block: 4, line: 2, chunk: null },
  });
});

test("caught exceptions and successful traces do not trigger exception navigation", () => {
  expect(navigateToException(fixture("caught_exception"))).toBeNull();
  expect(navigateToException(fixture("fact"))).toBeNull();
});
