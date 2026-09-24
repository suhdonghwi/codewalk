import { expect, test } from "vitest";

import { columnTops, type ColumnInput } from "./layout.ts";

function column(
  measured: boolean,
  anchorCenterY: number | null,
  options: { stale?: boolean } = {},
): ColumnInput {
  return {
    measurement: measured
      ? { block: 0, openSite: options.stale === true ? 2 : 1, anchorCenterY }
      : null,
    openSite: 1,
  };
}

test("each column's title bar centres on its parent's measured anchor", () => {
  expect(
    columnTops([column(true, 90), column(true, 50), column(true, null)]),
  ).toEqual([0, 76, 112]);
});

test.each([
  {
    name: "a stale anchor places its own column but not the next",
    columns: [
      column(true, 90),
      column(true, 50, { stale: true }),
      column(true, 0),
    ],
    expected: 2,
  },
  {
    name: "an unmeasured column stops the layout before it",
    columns: [column(true, 90), column(false, null), column(true, 0)],
    expected: 1,
  },
])("$name", ({ columns, expected }) => {
  expect(columnTops(columns)).toHaveLength(expected);
});
