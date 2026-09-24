import { useEffect, useState } from "react";

import { useCanvasStore, useWindowDrag } from "@/domain/canvas/index.ts";

import { columnTops, sameMeasurement, type Measurement } from "./layout.ts";
import { pathColumns, selectSibling, toggleSite, type Path } from "./path.ts";
import { TreeColumn } from "./tree-column.tsx";
import { mountCodeHighlightStyle } from "../view/tokens.ts";

import type { Trace } from "@codewalk/trace";

interface TraceTreeProps {
  trace: Trace;
  path: Path;
  onNavigate: (path: Path) => void;
}

export function TraceTree({ trace, path, onNavigate }: TraceTreeProps) {
  const treeWindow = useCanvasStore((state) => state.windows.trace);

  const [measurements, setMeasurements] = useState<(Measurement | undefined)[]>(
    [],
  );

  const rootTitlebarProps = useWindowDrag("trace");

  useEffect(() => {
    mountCodeHighlightStyle(document);
  }, []);

  const columns = pathColumns(trace, path);

  const tops = columnTops(
    columns.map((column, index) => {
      const measurement = measurements[index];

      return {
        measurement:
          measurement?.block === column.block.id ? measurement : null,
        openSite: column.openSite,
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

  if (path.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute flex w-max items-start gap-16"
      data-trace-tree
      onPointerDown={() => useCanvasStore.getState().bringToFront("trace")}
      style={{ left: treeWindow.x, top: treeWindow.y, zIndex: treeWindow.z }}
    >
      {columns.map((column, columnIndex) => (
        <TreeColumn
          column={column}
          columnIndex={columnIndex}
          key={columnIndex}
          onChoose={(block) => {
            onNavigate(selectSibling(path, columnIndex, block));
          }}
          onMeasure={onMeasure}
          onToggleSite={(site) => {
            onNavigate(toggleSite(trace, path, columnIndex, site));
          }}
          rootTitlebarProps={columnIndex === 0 ? rootTitlebarProps : undefined}
          top={tops[columnIndex]}
          trace={trace}
        />
      ))}
    </div>
  );
}
