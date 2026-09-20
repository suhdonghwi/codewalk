// Mirrors --spacing-titlebar in index.css for trace layout calculations.
export const TITLE_BAR = 28;

const COLUMN_GAP = 64;

// A site with several child blocks shows them as a sibling list between the
// parent window and the expanded child.
export const SIBLING_LIST_WIDTH = 168;

const SIBLING_LIST_GAP = 8;

export interface ColumnInput {
  hasSiblingList: boolean;
  width: number;
  anchorCenterY: number | null;
}

export interface ColumnLayout {
  x: number; // left edge of the column: the sibling list if any, else the window
  windowX: number;
  top: number;
}

interface ColumnReadiness {
  measured: boolean; // the expanded window's own size is known
  anchorFresh: boolean; // its anchor line was measured for the current open site
}

/**
 * How many leading columns can be laid out right now. A column needs its own
 * measurement and a fresh anchor from every column before it; its own anchor
 * only matters to the column after it. Laying out this prefix — rather than all
 * columns or none — keeps existing windows and edges mounted while a newly
 * opened column is still being measured.
 */
export function layoutableColumns(columns: readonly ColumnReadiness[]): number {
  let count = 0;

  for (const column of columns) {
    if (!column.measured) break;
    count += 1;

    if (!column.anchorFresh) break;
  }

  return count;
}

export function layoutTree(columns: ColumnInput[]): ColumnLayout[] {
  const layouts: ColumnLayout[] = [];

  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];

    if (column === undefined) continue;

    if (index === 0) {
      layouts.push({ x: 0, windowX: 0, top: 0 });
      continue;
    }

    const previous = columns[index - 1];
    const previousLayout = layouts[index - 1];

    if (previous === undefined || previousLayout === undefined) continue;

    if (previous.anchorCenterY === null) {
      throw new Error("A parent column with a child must have an anchor");
    }

    const x = previousLayout.windowX + previous.width + COLUMN_GAP;

    layouts.push({
      x,
      windowX: column.hasSiblingList
        ? x + SIBLING_LIST_WIDTH + SIBLING_LIST_GAP
        : x,
      top: previousLayout.top + previous.anchorCenterY - TITLE_BAR / 2,
    });
  }

  return layouts;
}
