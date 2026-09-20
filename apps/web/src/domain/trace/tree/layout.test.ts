import { expect, test } from "vitest";

import { layoutableColumns, layoutTree, type ColumnInput } from "./layout.ts";

test("columns accumulate parent widths, make room for sibling lists and align to measured anchors", () => {
  const columns: ColumnInput[] = [
    { hasSiblingList: false, width: 300, anchorCenterY: 90 },
    { hasSiblingList: true, width: 180, anchorCenterY: 50 },
    { hasSiblingList: false, width: 120, anchorCenterY: null },
  ];

  expect(layoutTree(columns)).toEqual([
    { x: 0, windowX: 0, top: 0 },
    { x: 364, windowX: 540, top: 76 },
    { x: 784, windowX: 784, top: 112 },
  ]);
});

test.each([
  {
    name: "a stale anchor in the deepest open column still lays out that column",
    columns: [
      { measured: true, anchorFresh: true },
      { measured: true, anchorFresh: false },
      { measured: false, anchorFresh: false },
    ],
    expected: 2,
  },
  {
    name: "an unmeasured column stops the layout before it",
    columns: [
      { measured: true, anchorFresh: true },
      { measured: false, anchorFresh: false },
      { measured: true, anchorFresh: true },
    ],
    expected: 1,
  },
  {
    name: "a fully measured path lays out every column",
    columns: [
      { measured: true, anchorFresh: true },
      { measured: true, anchorFresh: false },
    ],
    expected: 2,
  },
])("$name", ({ columns, expected }) => {
  expect(layoutableColumns(columns)).toBe(expected);
});
