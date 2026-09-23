import { useState } from "react";

import { useCanvasStore, useWindowDrag } from "@/domain/canvas/index.ts";

import { layoutableColumns, layoutTree, SIBLING_LIST_WIDTH } from "./layout.ts";
import { sameMeasurement, type Measurement } from "./measured-trace-window.tsx";
import { pathColumns, selectSibling, toggleSite } from "./path.ts";
import { TreeEdges } from "./tree-edges.tsx";
import { TreeColumn } from "./tree-column.tsx";
import { partSize, useTraceStore } from "../store.ts";

import type { LocId, NodeId, Trace } from "@codewalk/trace";

export function TraceTree({ trace }: { trace: Trace }) {
  const path = useTraceStore((state) => state.path);
  const columnSizes = useTraceStore((state) => state.columnSizes);
  const treeWindow = useCanvasStore((state) => state.windows.trace);

  const [measurements, setMeasurements] = useState<(Measurement | undefined)[]>(
    [],
  );

  const rootTitlebarProps = useWindowDrag("trace");

  const columns = pathColumns(trace, path);

  // A measurement stays usable for its own column while the open site changes;
  // only the anchor it carries goes stale (see `layoutableColumns`).
  const columnMeasurements = columns.map((column, index) => {
    const measurement = measurements[index];

    return measurement !== undefined && measurement.block === column.block
      ? measurement
      : null;
  });

  const layoutable = layoutableColumns(
    columnMeasurements.map((measurement, index) => ({
      measured: measurement !== null,
      anchorFresh:
        measurement !== null &&
        measurement.anchorCenterY !== null &&
        measurement.openSite === columns[index]?.openSite,
    })),
  );

  const layouts = layoutTree(
    columnMeasurements.slice(0, layoutable).flatMap((measurement, index) => {
      const column = columns[index];

      if (measurement === null || column === undefined) return [];

      return [
        {
          siblingListWidth:
            column.blocks.length > 1
              ? (partSize(columnSizes, index, "siblings").width ??
                SIBLING_LIST_WIDTH)
              : null,
          width: measurement.width,
          anchorCenterY: measurement.anchorCenterY,
        },
      ];
    }),
  );

  function onMeasure(column: number, measurement: Measurement): void {
    setMeasurements((current) => {
      if (sameMeasurement(current[column], measurement)) return current;
      const next = [...current];
      next[column] = measurement;

      return next;
    });
  }

  function openSite(column: number, site: LocId): void {
    const current = useTraceStore.getState().path;
    useTraceStore.getState().setPath(toggleSite(trace, current, column, site));
  }

  function chooseSibling(column: number, block: NodeId): void {
    const current = useTraceStore.getState().path;
    const next = selectSibling(current, column, block);

    if (next === current) return;
    useTraceStore.getState().setPath(next);
  }

  if (path.length === 0) return null;

  return (
    <div
      className="absolute"
      data-trace-tree
      onPointerDown={() => useCanvasStore.getState().bringToFront("trace")}
      style={{ left: treeWindow.x, top: treeWindow.y, zIndex: treeWindow.z }}
    >
      <TreeEdges
        layouts={layouts}
        measurements={columnMeasurements}
        path={path}
      />
      {columns.map((column, columnIndex) => {
        return (
          <TreeColumn
            column={column}
            columnIndex={columnIndex}
            key={columnIndex}
            layout={layouts[columnIndex]}
            onChoose={chooseSibling}
            onMeasure={onMeasure}
            onToggleSite={openSite}
            rootTitlebarProps={
              columnIndex === 0 ? rootTitlebarProps : undefined
            }
            trace={trace}
          />
        );
      })}
    </div>
  );
}
