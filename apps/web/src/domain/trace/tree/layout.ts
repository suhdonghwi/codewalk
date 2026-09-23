import type { LocId, NodeId } from "@codewalk/trace";

// Mirrors --spacing-titlebar in index.css for trace layout calculations.
export const TITLE_BAR = 28;

const COLUMN_GAP = 64;

const SIBLING_LIST_GAP = 8;

export interface Measurement {
  block: NodeId;
  openSite: LocId | null;
  width: number;
  anchorCenterY: number | null;
}

export function sameMeasurement(
  left: Measurement | undefined,
  right: Measurement,
): boolean {
  return (
    left?.block === right.block &&
    left.openSite === right.openSite &&
    left.width === right.width &&
    left.anchorCenterY === right.anchorCenterY
  );
}

export interface ColumnInput {
  measurement: Measurement | null;
  openSite: LocId | null;
  siblingListWidth: number | null;
}

export interface ColumnLayout {
  x: number;
  windowX: number;
  top: number;
  edge: { fromX: number; toX: number; y: number } | null;
}

interface ParentAnchor {
  right: number;
  anchorY: number;
}

/**
 * Lays out the leading columns that can be placed right now. A column needs
 * its own measurement and a fresh anchor from the column before it, so layout
 * stops at the first unmeasured column and after a column whose anchor was
 * measured for a different open site. Laying out this prefix — rather than all
 * columns or none — keeps existing windows and edges mounted while a newly
 * opened column is still being measured.
 */
export function layoutTree(columns: ColumnInput[]): ColumnLayout[] {
  const layouts: ColumnLayout[] = [];
  let parent: ParentAnchor | null = null;

  for (const { measurement, openSite, siblingListWidth } of columns) {
    if (measurement === null || (layouts.length > 0 && parent === null)) break;

    const x: number = parent === null ? 0 : parent.right + COLUMN_GAP;
    const top: number = parent === null ? 0 : parent.anchorY - TITLE_BAR / 2;

    const windowX: number =
      siblingListWidth === null ? x : x + siblingListWidth + SIBLING_LIST_GAP;

    layouts.push({
      x,
      windowX,
      top,
      edge:
        parent === null
          ? null
          : { fromX: parent.right, toX: x, y: parent.anchorY },
    });

    parent =
      measurement.anchorCenterY !== null && measurement.openSite === openSite
        ? {
            right: windowX + measurement.width,
            anchorY: top + measurement.anchorCenterY,
          }
        : null;
  }

  return layouts;
}
