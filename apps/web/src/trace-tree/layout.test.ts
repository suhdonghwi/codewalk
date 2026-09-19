import { describe, expect, test } from "vitest";

import {
  layoutTree,
  stackRows,
  visualExpandedIndex,
  type ColumnInput,
} from "./layout.ts";

test("columns accumulate parent widths and align child title bars to measured anchors", () => {
  const columns: ColumnInput[] = [
    {
      count: 1,
      expandedIndex: 0,
      width: 300,
      height: 200,
      anchorCenterY: 90,
    },
    {
      count: 4,
      expandedIndex: 2,
      width: 180,
      height: 140,
      anchorCenterY: 50,
    },
    {
      count: 1,
      expandedIndex: 0,
      width: 120,
      height: 80,
      anchorCenterY: null,
    },
  ];

  expect(layoutTree(columns)).toEqual([
    { x: 0, expandedTop: 0, stackTop: 0 },
    { x: 364, expandedTop: 76, stackTop: 12 },
    { x: 608, expandedTop: 112, stackTop: 112 },
  ]);
});

describe("stackRows", () => {
  test.each([
    {
      name: "a small stack",
      count: 4,
      expanded: 2,
      first: { kind: "block", index: 0 },
      last: { kind: "block", index: 3 },
      length: 4,
      visual: 2,
    },
    {
      name: "an expansion near the start",
      count: 200,
      expanded: 2,
      first: { kind: "block", index: 0 },
      last: { kind: "omitted", side: "below" },
      length: 54,
      visual: 2,
    },
    {
      name: "an expansion near the end",
      count: 200,
      expanded: 198,
      first: { kind: "omitted", side: "above" },
      last: { kind: "block", index: 199 },
      length: 53,
      visual: 51,
    },
    {
      name: "an expansion in the middle",
      count: 200,
      expanded: 100,
      first: { kind: "omitted", side: "above" },
      last: { kind: "omitted", side: "below" },
      length: 103,
      visual: 51,
    },
  ])(
    "keeps only the nearest siblings for $name",
    ({ count, expanded, first, last, length, visual }) => {
      const rows = stackRows(count, expanded);

      expect({
        first: rows[0],
        last: rows.at(-1),
        length: rows.length,
        visual: visualExpandedIndex(rows, expanded),
      }).toEqual({ first, last, length, visual });
    },
  );
});
