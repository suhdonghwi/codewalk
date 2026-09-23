import type { LocId, NodeId } from "@codewalk/trace";

// Mirrors --spacing-titlebar in index.css for trace layout calculations.
export const TITLE_BAR = 28;

export interface Measurement {
  block: NodeId;
  openSite: LocId | null;
  anchorCenterY: number | null;
}

export function sameMeasurement(
  left: Measurement | undefined,
  right: Measurement,
): boolean {
  return (
    left?.block === right.block &&
    left.openSite === right.openSite &&
    left.anchorCenterY === right.anchorCenterY
  );
}

export interface ColumnInput {
  measurement: Measurement | null;
  openSite: LocId | null;
}

/**
 * The tops of the leading columns that can be placed right now. A column needs
 * its own measurement and a fresh anchor from the column before it, so layout
 * stops at the first unmeasured column and after a column whose anchor was
 * measured for a different open site. Placing this prefix — rather than all
 * columns or none — keeps existing windows mounted while a newly opened
 * column is still being measured.
 */
export function columnTops(columns: ColumnInput[]): number[] {
  const tops: number[] = [];
  let top = 0;

  for (const { measurement, openSite } of columns) {
    if (measurement === null) break;
    tops.push(top);

    if (
      measurement.anchorCenterY === null ||
      measurement.openSite !== openSite
    ) {
      break;
    }

    top += measurement.anchorCenterY - TITLE_BAR / 2;
  }

  return tops;
}
