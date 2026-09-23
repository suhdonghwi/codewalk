import { expect, test } from "vitest";

import { layoutTree, type ColumnInput } from "./layout.ts";

function column(
  width: number | null,
  anchorCenterY: number | null,
  options: { stale?: boolean } = {},
): ColumnInput {
  return {
    measurement:
      width === null
        ? null
        : {
            block: 0,
            openSite: options.stale === true ? 2 : 1,
            width,
            anchorCenterY,
          },
    openSite: 1,
  };
}

test("columns accumulate parent widths and align to measured anchors", () => {
  expect(
    layoutTree([column(300, 90), column(388, 50), column(120, null)]),
  ).toEqual([
    { x: 0, top: 0, edge: null },
    { x: 364, top: 76, edge: { fromX: 300, toX: 364, y: 90 } },
    { x: 816, top: 112, edge: { fromX: 752, toX: 816, y: 126 } },
  ]);
});

test.each([
  {
    name: "a stale anchor lays out its own column but not the next",
    columns: [
      column(300, 90),
      column(180, 50, { stale: true }),
      column(120, 0),
    ],
    expected: 2,
  },
  {
    name: "an unmeasured column stops the layout before it",
    columns: [column(300, 90), column(null, null), column(120, 0)],
    expected: 1,
  },
])("$name", ({ columns, expected }) => {
  expect(layoutTree(columns)).toHaveLength(expected);
});
