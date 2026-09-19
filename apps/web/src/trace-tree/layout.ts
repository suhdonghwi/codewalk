export const TITLE_BAR = 28;

const COLUMN_GAP = 64;

const STACK_GAP = 4;

const STACK_RADIUS = 50;

export interface ColumnInput {
  count: number;
  expandedIndex: number;
  width: number;
  height: number;
  anchorCenterY: number | null;
}

export interface ColumnLayout {
  x: number;
  expandedTop: number;
  stackTop: number;
}

export type StackRow =
  | { kind: "block"; index: number }
  | { kind: "omitted"; side: "above" | "below" };

export function layoutTree(columns: ColumnInput[]): ColumnLayout[] {
  const layouts: ColumnLayout[] = [];

  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];

    if (column === undefined) continue;

    if (index === 0) {
      layouts.push({ x: 0, expandedTop: 0, stackTop: 0 });
      continue;
    }

    const previous = columns[index - 1];
    const previousLayout = layouts[index - 1];

    if (previous === undefined || previousLayout === undefined) continue;

    if (previous.anchorCenterY === null) {
      throw new Error("A parent column with a child must have an anchor");
    }

    const expandedTop =
      previousLayout.expandedTop + previous.anchorCenterY - TITLE_BAR / 2;

    layouts.push({
      x: previousLayout.x + previous.width + COLUMN_GAP,
      expandedTop,
      stackTop: expandedTop - column.expandedIndex * (TITLE_BAR + STACK_GAP),
    });
  }

  return layouts;
}

export function stackRows(count: number, expandedIndex: number): StackRow[] {
  const start = Math.max(0, expandedIndex - STACK_RADIUS);
  const end = Math.min(count, expandedIndex + STACK_RADIUS + 1);
  const rows: StackRow[] = [];

  if (start > 0) rows.push({ kind: "omitted", side: "above" });

  for (let index = start; index < end; index += 1) {
    rows.push({ kind: "block", index });
  }

  if (end < count) rows.push({ kind: "omitted", side: "below" });

  return rows;
}

export function visualExpandedIndex(
  rows: StackRow[],
  expandedIndex: number,
): number {
  return rows.findIndex(
    (row) => row.kind === "block" && row.index === expandedIndex,
  );
}
