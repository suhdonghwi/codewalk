import { TITLE_BAR, type ColumnLayout } from "./layout.ts";

import type { Measurement } from "./measured-trace-window.tsx";
import type { NodeId } from "@codewalk/trace";

interface TreeEdgesProps {
  layouts: ColumnLayout[];
  measurements: (Measurement | null)[];
  path: NodeId[];
}

export function TreeEdges({ layouts, measurements, path }: TreeEdgesProps) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute z-0 size-px overflow-visible"
    >
      {layouts.slice(1).map((layout, relativeIndex) => {
        const column = relativeIndex + 1;
        const parentLayout = layouts[column - 1];
        const parentMeasurement = measurements[column - 1];
        const child = path[column];

        if (
          parentLayout === undefined ||
          parentMeasurement === null ||
          parentMeasurement === undefined ||
          parentMeasurement.anchorCenterY === null ||
          child === undefined
        ) {
          return null;
        }

        const startX = parentLayout.x + parentMeasurement.width;

        const startY =
          parentLayout.expandedTop + parentMeasurement.anchorCenterY;

        const endX = layout.x;
        const endY = layout.expandedTop + TITLE_BAR / 2;
        const controlX = (startX + endX) / 2;

        return (
          <path
            className="animate-tree-fade-in fill-none stroke-site-accent/60 stroke-[1.5]"
            d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`}
            key={`${column}:${child}`}
          />
        );
      })}
    </svg>
  );
}
