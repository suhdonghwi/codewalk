import type { HTMLAttributes } from "react";

import { ResizeHandles, type Size } from "@/domain/canvas/index.ts";

import { SiblingList } from "./sibling-list.tsx";
import { SIBLING_LIST_WIDTH, type Measurement } from "./layout.ts";
import { TraceWindow } from "./trace-window.tsx";
import { partSize, useTraceStore, type ColumnPart } from "../store.ts";

import type { ColumnLayout } from "./layout.ts";
import type { PathColumn } from "./path.ts";
import type { LocId, NodeId, Trace } from "@codewalk/trace";

const MINIMUM_SIZE: Record<ColumnPart, Size> = {
  window: { width: 160, height: 68 },
  siblings: { width: 120, height: 76 },
};

function columnResizeHandles(column: number, part: ColumnPart) {
  const { resizeColumn } = useTraceStore.getState();

  return (
    <ResizeHandles
      minimumSize={MINIMUM_SIZE[part]}
      onReset={(axes) => {
        resizeColumn(column, part, axes, null);
      }}
      onResize={(size, axes) => {
        resizeColumn(column, part, axes, size);
      }}
    />
  );
}

interface TreeColumnProps {
  trace: Trace;
  column: PathColumn;
  columnIndex: number;
  layout: ColumnLayout | undefined;
  onMeasure: (column: number, measurement: Measurement) => void;
  onToggleSite: (column: number, site: LocId) => void;
  onChoose: (column: number, block: NodeId) => void;
  rootTitlebarProps?: HTMLAttributes<HTMLDivElement> | undefined;
}

export function TreeColumn({
  trace,
  column,
  columnIndex,
  layout,
  onMeasure,
  onToggleSite,
  onChoose,
  rootTitlebarProps,
}: TreeColumnProps) {
  const visibility = layout === undefined ? "hidden" : "visible";

  const windowSize = useTraceStore((state) =>
    partSize(state.columnSizes, columnIndex, "window"),
  );

  const siblingsSize = useTraceStore((state) =>
    partSize(state.columnSizes, columnIndex, "siblings"),
  );

  return (
    <>
      {column.blocks.length > 1 ? (
        <div
          className="absolute z-1 animate-tree-fade-in"
          key={`siblings:${column.blocks[0]}`}
          style={{ left: layout?.x ?? 0, top: layout?.top ?? 0, visibility }}
        >
          <SiblingList
            blocks={column.blocks}
            height={siblingsSize.height}
            resizeHandles={columnResizeHandles(columnIndex, "siblings")}
            width={siblingsSize.width ?? SIBLING_LIST_WIDTH}
            onChoose={(block) => onChoose(columnIndex, block)}
            selectedIndex={column.expandedIndex}
            trace={trace}
          />
        </div>
      ) : null}
      <div
        className="absolute z-1 animate-tree-fade-in"
        data-block={column.block}
        key={column.block}
        style={{
          left: layout?.windowX ?? 0,
          top: layout?.top ?? 0,
          visibility,
        }}
      >
        <TraceWindow
          block={column.block}
          column={columnIndex}
          height={windowSize.height}
          resizeHandles={columnResizeHandles(columnIndex, "window")}
          width={windowSize.width}
          onMeasure={onMeasure}
          onToggleSite={(site) => onToggleSite(columnIndex, site)}
          openSite={column.openSite}
          position={{
            index: column.expandedIndex,
            count: column.blocks.length,
          }}
          titlebarProps={columnIndex === 0 ? rootTitlebarProps : undefined}
          trace={trace}
        />
      </div>
    </>
  );
}
