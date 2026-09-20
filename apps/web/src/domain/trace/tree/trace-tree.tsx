import { useCallback, useMemo, useRef, useState } from "react";

import { useCanvasStore, useWindowDrag } from "@/domain/canvas/index.ts";

import { layoutableColumns, layoutTree } from "./layout.ts";
import { sameMeasurement, type Measurement } from "./measured-trace-window.tsx";
import { pathColumn, selectSibling, toggleSite } from "./path.ts";
import { TreeEdges } from "./tree-edges.tsx";
import { TreeColumn } from "./tree-column.tsx";
import { usePendingReveal } from "./use-pending-reveal.ts";
import { useTraceStore } from "../store.ts";

import type { LocId, NodeId, Trace } from "@codewalk/trace";

export function TraceTree({ trace }: { trace: Trace }) {
  const path = useTraceStore((state) => state.path);
  const treeWindow = useCanvasStore((state) => state.windows.trace);

  const [measurements, setMeasurements] = useState<(Measurement | undefined)[]>(
    [],
  );

  const treeRef = useRef<HTMLDivElement>(null);
  const rootTitlebarProps = useWindowDrag("trace");

  const columns = useMemo(
    () => path.map((_, column) => pathColumn(trace, path, column)),
    [path, trace],
  );

  // A measurement stays usable for its own column while the open site changes;
  // only the anchor it carries goes stale (see `layoutableColumns`).
  const columnMeasurements = columns.map((column, index) => {
    const measurement = measurements[index];

    return column !== null &&
      measurement !== undefined &&
      measurement.block === path[index]
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

      if (measurement === null || column === null || column === undefined) {
        return [];
      }

      return [
        {
          hasSiblingList: column.blocks.length > 1,
          width: measurement.width,
          anchorCenterY: measurement.anchorCenterY,
        },
      ];
    }),
  );

  const onMeasure = useCallback(
    (column: number, measurement: Measurement): void => {
      setMeasurements((current) => {
        if (sameMeasurement(current[column], measurement)) return current;
        const next = [...current];
        next[column] = measurement;

        return next;
      });
    },
    [],
  );

  function openSite(column: number, site: LocId): void {
    const current = useTraceStore.getState().path;
    const next = toggleSite(trace, current, column, site);
    const child = next[column + 1];

    if (child !== undefined) {
      useTraceStore.getState().setPath(next, { block: child, line: null });

      return;
    }

    useTraceStore.getState().setPath(next, null);
  }

  function chooseSibling(column: number, block: NodeId): void {
    const current = useTraceStore.getState().path;
    const next = selectSibling(current, column, block);

    if (next === current) return;
    useTraceStore.getState().setPath(next, null);
  }

  usePendingReveal(treeRef, path, layouts, columnMeasurements);

  if (path.length === 0 || columns.some((column) => column === null)) {
    return null;
  }

  return (
    <div
      className="absolute"
      data-trace-tree
      onPointerDown={() => useCanvasStore.getState().bringToFront("trace")}
      ref={treeRef}
      style={{ left: treeWindow.x, top: treeWindow.y, zIndex: treeWindow.z }}
    >
      <TreeEdges
        layouts={layouts}
        measurements={columnMeasurements}
        path={path}
      />
      {columns.map((column, columnIndex) => {
        if (column === null) return null;
        const expandedBlock = path[columnIndex];

        if (expandedBlock === undefined) return null;

        return (
          <TreeColumn
            column={column}
            columnIndex={columnIndex}
            expandedBlock={expandedBlock}
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
