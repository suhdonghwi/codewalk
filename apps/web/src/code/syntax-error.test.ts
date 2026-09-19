import { expect, test } from "vitest";

import { syntaxErrorRange } from "./syntax-error.ts";

test.each([
  {
    name: "a non-empty parser range",
    length: 10,
    start: 3,
    end: 6,
    expected: { from: 3, to: 6 },
  },
  {
    name: "an empty range within the document",
    length: 10,
    start: 3,
    end: 3,
    expected: { from: 3, to: 4 },
  },
  {
    name: "an empty range at the end of the document",
    length: 10,
    start: 10,
    end: 10,
    expected: { from: 9, to: 10 },
  },
])("the syntax marker covers $name", ({ length, start, end, expected }) => {
  expect(syntaxErrorRange(length, start, end)).toEqual(expected);
});
