import type { HTMLAttributes } from "react";
import { useLayoutEffect, useRef } from "react";

import {
  ResizeHandles,
  useCanvasStore,
  type Size,
} from "@/domain/canvas/index.ts";

import { SiblingList } from "./sibling-list.tsx";
import { TITLE_BAR, type Measurement } from "./layout.ts";
import { TraceWindow } from "./trace-window.tsx";
import { partSize, useTraceStore, type ColumnPart } from "../store.ts";
import { siblingAfter, siblingColumns } from "../view/block-title.ts";

import type { ColumnLayout } from "./layout.ts";
import type { PathColumn } from "./path.ts";
import type { LocId, NodeId, Trace } from "@codewalk/trace";

const MINIMUM_SIZE: Record<ColumnPart, Size> = {
  window: { width: 160, height: 68 },
  siblings: { width: 120, height: 76 },
};

function measureColumn(
  row: HTMLElement,
  windowElement: HTMLElement,
): Omit<Measurement, "block" | "openSite"> {
  const rowBounds = row.getBoundingClientRect();
  const bounds = windowElement.getBoundingClientRect();
  const scale = useCanvasStore.getState().view.scale;
  const anchor = windowElement.querySelector<HTMLElement>("[data-site-anchor]");
  const anchorBounds = anchor?.getBoundingClientRect();

  const height = bounds.height / scale;

  return {
    width: (bounds.right - rowBounds.left) / scale,
    anchorCenterY:
      anchorBounds === undefined
        ? null
        : Math.min(
            height,
            Math.max(
              TITLE_BAR,
              (anchorBounds.top + anchorBounds.height / 2 - bounds.top) / scale,
            ),
          ),
  };
}

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

  const columns = siblingColumns(trace, column.blocks);
  const rowRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const { block, openSite } = column;

  useLayoutEffect(() => {
    const row = rowRef.current;
    const windowElement = windowRef.current;

    if (row === null || windowElement === null) return;

    const report = (): void => {
      onMeasure(columnIndex, {
        block,
        openSite,
        ...measureColumn(row, windowElement),
      });
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(row);
    observer.observe(windowElement);
    windowElement.addEventListener("scroll", report, {
      capture: true,
      passive: true,
    });

    return () => {
      observer.disconnect();
      windowElement.removeEventListener("scroll", report, { capture: true });
    };
  }, [block, columnIndex, onMeasure, openSite]);

  return (
    <div
      className="absolute z-1 flex w-max items-start gap-2"
      ref={rowRef}
      style={{ left: layout?.x ?? 0, top: layout?.top ?? 0, visibility }}
    >
      {column.blocks.length > 1 ? (
        <div
          className="animate-tree-fade-in"
          key={`siblings:${column.blocks[0]}`}
        >
          <SiblingList
            blocks={column.blocks}
            after={siblingAfter(trace, column.blocks, columns)}
            columns={columns}
            height={siblingsSize.height}
            resizeHandles={columnResizeHandles(columnIndex, "siblings")}
            width={siblingsSize.width}
            onChoose={(sibling) => onChoose(columnIndex, sibling)}
            selectedIndex={column.expandedIndex}
            trace={trace}
          />
        </div>
      ) : null}
      <div
        className="animate-tree-fade-in"
        data-block={column.block}
        key={column.block}
        ref={windowRef}
      >
        <TraceWindow
          block={column.block}
          columns={columns}
          height={windowSize.height}
          resizeHandles={columnResizeHandles(columnIndex, "window")}
          width={windowSize.width}
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
    </div>
  );
}
