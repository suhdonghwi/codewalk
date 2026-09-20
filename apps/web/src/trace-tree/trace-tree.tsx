import { useCallback, useMemo, useRef, useState } from "react";

import { useWindowDrag } from "@/canvas/use-window-drag.ts";
import { useAppStore } from "@/state/store.ts";

import {
  layoutableColumns,
  layoutTree,
  stackRows,
  visualExpandedIndex,
} from "./layout.ts";
import { sameMeasurement, type Measurement } from "./measured-trace-window.tsx";
import { pathColumn, selectSibling, toggleSite } from "./path.ts";
import { TreeEdges } from "./tree-edges.tsx";
import { TreeRows } from "./tree-rows.tsx";
import { usePendingReveal } from "./use-pending-reveal.ts";

import type { LocId, NodeId, Trace } from "@codewalk/trace";

export function TraceTree({ trace }: { trace: Trace }) {
  const path = useAppStore((state) => state.path);
  const focus = useAppStore((state) => state.focus);
  const treeWindow = useAppStore((state) => state.windows.trace);

  const [measurements, setMeasurements] = useState<(Measurement | undefined)[]>(
    [],
  );

  const treeRef = useRef<HTMLDivElement>(null);
  const rootTitlebarProps = useWindowDrag("trace");

  const columns = useMemo(
    () => path.map((_, column) => pathColumn(trace, path, column)),
    [path, trace],
  );

  const rows = useMemo(
    () =>
      columns.map((column) =>
        column === null
          ? []
          : stackRows(column.blocks.length, column.expandedIndex),
      ),
    [columns],
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
          count: (rows[index] ?? []).length,
          expandedIndex: visualExpandedIndex(
            rows[index] ?? [],
            column.expandedIndex,
          ),
          width: measurement.width,
          height: measurement.height,
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
    const current = useAppStore.getState().path;
    const next = toggleSite(trace, current, column, site);
    const child = next[column + 1];

    if (child !== undefined) {
      useAppStore.getState().setPath(next, { block: child, focusLine: false });

      return;
    }

    useAppStore.getState().setPath(next, null);
  }

  function chooseSibling(column: number, block: NodeId): void {
    const current = useAppStore.getState().path;
    const next = selectSibling(current, column, block);

    if (next === current) return;
    useAppStore.getState().setPath(next, { block, focusLine: false });
  }

  usePendingReveal(treeRef, path, layouts, columnMeasurements);

  if (path.length === 0 || columns.some((column) => column === null)) {
    return null;
  }

  return (
    <div
      className="absolute"
      data-trace-tree
      onPointerDown={() => useAppStore.getState().bringToFront("trace")}
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
          <TreeRows
            column={column}
            columnIndex={columnIndex}
            expandedBlock={expandedBlock}
            focus={focus}
            key={columnIndex}
            layout={layouts[columnIndex]}
            measurement={columnMeasurements[columnIndex] ?? null}
            onChoose={chooseSibling}
            onMeasure={onMeasure}
            onToggleSite={openSite}
            rootTitlebarProps={
              columnIndex === 0 ? rootTitlebarProps : undefined
            }
            rows={rows[columnIndex] ?? []}
            trace={trace}
          />
        );
      })}
    </div>
  );
}
