import { useEffect, useState } from "react";

import { useCanvasStore, useWindowDrag } from "@/domain/canvas/index.ts";

import { layoutTree, sameMeasurement, type Measurement } from "./layout.ts";
import { pathColumns, selectSibling, toggleSite } from "./path.ts";
import { TreeEdges } from "./tree-edges.tsx";
import { TreeColumn } from "./tree-column.tsx";
import { siblingListWidth, useTraceStore } from "../store.ts";
import { mountCodeHighlightStyle } from "../view/tokens.ts";

import type { LocId, NodeId, Trace } from "@codewalk/trace";

export function TraceTree({ trace }: { trace: Trace }) {
  const path = useTraceStore((state) => state.path);
  const columnSizes = useTraceStore((state) => state.columnSizes);
  const treeWindow = useCanvasStore((state) => state.windows.trace);

  const [measurements, setMeasurements] = useState<(Measurement | undefined)[]>(
    [],
  );

  const rootTitlebarProps = useWindowDrag("trace");

  useEffect(() => {
    mountCodeHighlightStyle(document);
  }, []);

  const columns = pathColumns(trace, path);

  const layouts = layoutTree(
    columns.map((column, index) => {
      const measurement = measurements[index];

      return {
        measurement: measurement?.block === column.block ? measurement : null,
        openSite: column.openSite,
        siblingListWidth:
          column.blocks.length > 1
            ? siblingListWidth(columnSizes, index)
            : null,
      };
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
    useTraceStore.getState().setPath(selectSibling(current, column, block));
  }

  if (path.length === 0) return null;

  return (
    <div
      className="absolute"
      data-trace-tree
      onPointerDown={() => useCanvasStore.getState().bringToFront("trace")}
      style={{ left: treeWindow.x, top: treeWindow.y, zIndex: treeWindow.z }}
    >
      <TreeEdges layouts={layouts} path={path} />
      {columns.map((column, columnIndex) => (
        <TreeColumn
          column={column}
          columnIndex={columnIndex}
          key={columnIndex}
          layout={layouts[columnIndex]}
          onChoose={chooseSibling}
          onMeasure={onMeasure}
          onToggleSite={openSite}
          rootTitlebarProps={columnIndex === 0 ? rootTitlebarProps : undefined}
          trace={trace}
        />
      ))}
    </div>
  );
}
