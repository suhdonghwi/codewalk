import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useWindowDrag } from "@/canvas/use-window-drag.ts";
import { revealRect } from "@/canvas/view.ts";
import { useAppStore } from "@/state/store.ts";

import {
  layoutableColumns,
  layoutTree,
  stackRows,
  visualExpandedIndex,
} from "./layout.ts";
import { sameMeasurement, type Measurement } from "./MeasuredTraceWindow.tsx";
import { pathColumn, selectSibling, toggleSite } from "./path.ts";
import { TreeEdges } from "./TreeEdges.tsx";
import { TreeRows } from "./TreeRows.tsx";

import type { LocId, NodeId, Trace } from "@codewalk/trace";

interface PendingReveal {
  column: number;
  block: NodeId;
}

const REVEAL_MARGIN = 48;

export function TraceTree({ trace }: { trace: Trace }) {
  const path = useAppStore((state) => state.path);
  const treeWindow = useAppStore((state) => state.windows.trace);

  const [measurements, setMeasurements] = useState<(Measurement | undefined)[]>(
    [],
  );

  const pendingReveal = useRef<PendingReveal | null>(null);
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
      pendingReveal.current = { column: column + 1, block: child };
    }

    useAppStore.getState().setPath(next);
  }

  function chooseSibling(column: number, block: NodeId): void {
    const current = useAppStore.getState().path;
    const next = selectSibling(current, column, block);

    if (next === current) return;
    pendingReveal.current = { column, block };
    useAppStore.getState().setPath(next);
  }

  useLayoutEffect(() => {
    const pending = pendingReveal.current;

    if (pending === null) return;

    if (path[pending.column] !== pending.block) {
      pendingReveal.current = null;

      return;
    }

    const layout = layouts[pending.column];
    const canvas = treeRef.current?.closest<HTMLElement>(".canvas");

    if (layout === undefined || canvas === undefined || canvas === null) return;

    const state = useAppStore.getState();

    const view = revealRect(
      state.view,
      { width: canvas.clientWidth, height: canvas.clientHeight },
      {
        x: state.windows.trace.x + layout.x,
        y: state.windows.trace.y + layout.expandedTop,
        width: 240,
        height: 120,
      },
      REVEAL_MARGIN,
    );

    pendingReveal.current = null;

    if (view !== state.view) state.setView(view);
  }, [layouts, path]);

  if (path.length === 0 || columns.some((column) => column === null)) {
    return null;
  }

  return (
    <div
      className="trace-tree"
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
